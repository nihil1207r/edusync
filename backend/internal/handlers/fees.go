package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// ---- Student/parent: view fee status & history ----------------------------

func (d *Deps) FeesForChild(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}

	var fees []map[string]interface{}
	var payments []map[string]interface{}
	_ = d.UserDB(c).Select("fees", url.Values{"select": {"*"}, "student_id": {"eq." + studentID}, "order": {"due_date.asc"}}, &fees)
	_ = d.UserDB(c).Select("fee_payments", url.Values{"select": {"*,fees!inner(student_id)"}, "fees.student_id": {"eq." + studentID}}, &payments)

	return c.JSON(fiber.Map{"success": true, "fees": orEmpty(fees), "payments": orEmpty(payments)})
}

// resolveStudentIDForUser handles both a student logging in directly (their
// own record via profiles.child_id) and a parent (their child's id).
func (d *Deps) resolveStudentIDForUser(c *fiber.Ctx) (string, error) {
	user := middleware.UserFromLocals(c)
	var profile map[string]interface{}
	if err := d.UserDB(c).SelectOne("profiles", url.Values{"select": {"child_id"}, "id": {"eq." + user.ID}}, &profile); err != nil {
		return "", err
	}
	childID, _ := profile["child_id"].(string)
	return childID, nil
}

// ---- Admin: set a fee line for a student -----------------------------------

func (d *Deps) CreateFee(c *fiber.Ctx) error {
	var body struct {
		StudentID string  `json:"studentId"`
		Term      string  `json:"term"`
		Amount    float64 `json:"amount"`
		DueDate   string  `json:"dueDate"`
	}
	if err := c.BodyParser(&body); err != nil || body.StudentID == "" || body.Term == "" || body.Amount <= 0 || body.DueDate == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId, term, amount, and dueDate are required."})
	}
	err := d.UserDB(c).Insert("fees", map[string]interface{}{
		"student_id": body.StudentID, "term": body.Term, "amount": body.Amount, "due_date": body.DueDate,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "fee.create", "fees", body.StudentID, fiber.Map{"after": fiber.Map{
		"term": body.Term, "amount": body.Amount, "dueDate": body.DueDate,
	}})
	return c.JSON(fiber.Map{"success": true})
}

// ---- Razorpay: create an order for a given fee -----------------------------
//
// Needs RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET set. Without them this returns
// a clear error rather than pretending to succeed — see NOTES.md.

type razorpayOrderResp struct {
	ID       string `json:"id"`
	Amount   int    `json:"amount"`
	Currency string `json:"currency"`
	Error    *struct {
		Description string `json:"description"`
	} `json:"error"`
}

func (d *Deps) CreateRazorpayOrder(c *fiber.Ctx) error {
	var body struct {
		FeeID string `json:"feeId"`
	}
	if err := c.BodyParser(&body); err != nil || body.FeeID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "feeId is required."})
	}

	keyID := os.Getenv("RAZORPAY_KEY_ID")
	keySecret := os.Getenv("RAZORPAY_KEY_SECRET")
	if keyID == "" || keySecret == "" {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
			"success": false,
			"message": "Razorpay is not configured on this server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (see NOTES.md).",
		})
	}

	var fee map[string]interface{}
	if err := d.UserDB(c).SelectOne("fees", url.Values{"select": {"*"}, "id": {"eq." + body.FeeID}}, &fee); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Fee not found."})
	}
	amount, _ := fee["amount"].(float64)
	// Razorpay wants the amount in the smallest currency unit (paise for INR).
	amountPaise := int(amount * 100)

	payload, _ := json.Marshal(map[string]interface{}{
		"amount":   amountPaise,
		"currency": "INR",
		"receipt":  body.FeeID,
	})

	req, _ := http.NewRequest(http.MethodPost, "https://api.razorpay.com/v1/orders", bytes.NewReader(payload))
	req.SetBasicAuth(keyID, keySecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Could not reach Razorpay: " + err.Error()})
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	var parsed razorpayOrderResp
	_ = json.Unmarshal(raw, &parsed)
	if parsed.Error != nil {
		return c.JSON(fiber.Map{"success": false, "message": parsed.Error.Description})
	}

	_ = d.UserDB(c).Insert("fee_payments", map[string]interface{}{
		"fee_id": body.FeeID, "razorpay_order_id": parsed.ID, "amount": amount,
	}, false, nil)

	return c.JSON(fiber.Map{
		"success": true, "orderId": parsed.ID, "amount": parsed.Amount, "currency": parsed.Currency, "keyId": keyID,
	})
}

// ---- Razorpay webhook: verify signature before recording anything as paid --

func (d *Deps) RazorpayWebhook(c *fiber.Ctx) error {
	secret := os.Getenv("RAZORPAY_WEBHOOK_SECRET")
	if secret == "" {
		return c.Status(fiber.StatusNotImplemented).SendString("Razorpay webhook secret not configured.")
	}

	body := c.Body()
	signature := c.Get("X-Razorpay-Signature")

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return c.Status(fiber.StatusUnauthorized).SendString("invalid signature")
	}

	var event struct {
		Event   string `json:"event"`
		Payload struct {
			Payment struct {
				Entity struct {
					ID      string `json:"id"`
					OrderID string `json:"order_id"`
					Amount  int    `json:"amount"`
					Method  string `json:"method"`
				} `json:"entity"`
			} `json:"payment"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		return c.Status(fiber.StatusBadRequest).SendString("bad payload")
	}

	if event.Event == "payment.captured" {
		// Razorpay calls this endpoint directly — there is no logged-in
		// user/session here (auth is the HMAC signature check above), so
		// this intentionally uses the service-role client, not d.UserDB.
		p := event.Payload.Payment.Entity
		var payment map[string]interface{}
		_ = d.DB.SelectOne("fee_payments", url.Values{"select": {"*"}, "razorpay_order_id": {"eq." + p.OrderID}}, &payment)
		feeID, _ := payment["fee_id"].(string)

		_ = d.DB.Update("fee_payments", url.Values{"razorpay_order_id": {"eq." + p.OrderID}}, map[string]interface{}{
			"razorpay_payment_id": p.ID, "method": p.Method, "verified": true, "paid_at": time.Now().Format(time.RFC3339),
		})
		if feeID != "" {
			_ = d.DB.Update("fees", url.Values{"id": {"eq." + feeID}}, map[string]interface{}{"status": "paid"})
		}
		_ = d.DB.Insert("audit_logs", map[string]interface{}{
			"actor_id": nil, "actor_name": "razorpay-webhook", "actor_role": "system",
			"action": "fee.payment_captured", "target_table": "fees", "target_id": feeID,
			"diff": fiber.Map{"after": fiber.Map{"status": "paid", "razorpayPaymentId": p.ID, "method": p.Method}},
		}, false, nil)
	}

	return c.SendStatus(fiber.StatusOK)
}
