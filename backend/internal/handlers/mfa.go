package handlers

import (
	"net/url"
	"time"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// MFAEnrollStart begins TOTP enrollment for the currently-logged-in
// admin/teacher (reachable pre-MFA-verification via RequireSession).
// Returns a QR code to scan in an authenticator app.
func (d *Deps) MFAEnrollStart(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	if !middleware.RoleRequiresMFA(user.Role) {
		return c.JSON(fiber.Map{"success": false, "message": "MFA is not required for this role."})
	}
	factor, err := d.DB.EnrollTOTP(user.SupabaseAccessToken)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{
		"success": true, "factorId": factor.ID,
		"qrCode": factor.TOTP.QRCode, "secret": factor.TOTP.Secret,
	})
}

// MFAEnrollConfirm verifies the first code from the authenticator app,
// which both activates the factor in GoTrue and elevates this session to
// aal2 (MFAVerified). Also flips profiles.mfa_enrolled so future logins
// go straight to a login-time challenge instead of enrollment.
//
// The mfa_enrolled write uses the service-role client rather than
// UserDB — same documented exception as the seed script and the Razorpay
// webhook: a normal "update your own profile" RLS policy would have to
// either allow editing every column (letting a user promote their own
// role) or be enforced by a column-level trigger we didn't have budget to
// add this pass. The Go handler only ever sets this one boolean field, so
// the risk here is contained and explicit rather than a general opening.
func (d *Deps) MFAEnrollConfirm(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	var body struct {
		FactorID string `json:"factorId"`
		Code     string `json:"code"`
	}
	if err := c.BodyParser(&body); err != nil || body.FactorID == "" || body.Code == "" {
		return c.JSON(fiber.Map{"success": false, "message": "factorId and code are required."})
	}

	challengeID, err := d.DB.ChallengeTOTP(user.SupabaseAccessToken, body.FactorID)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	session, err := d.DB.VerifyTOTP(user.SupabaseAccessToken, body.FactorID, challengeID, body.Code)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Incorrect code. Try again."})
	}

	_ = d.DB.Update("profiles", url.Values{"id": {"eq." + user.ID}}, map[string]interface{}{"mfa_enrolled": true})

	user.SupabaseAccessToken = session.AccessToken
	user.SupabaseRefreshToken = session.RefreshToken
	user.SupabaseExpiresAt = time.Now().Add(time.Duration(session.ExpiresIn) * time.Second).Unix()
	user.MFAVerified = true
	if err := middleware.IssueSession(c, d.Secret, *user); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Server error."})
	}

	d.Audit(c, "mfa.enrolled", "profiles", user.ID, nil)
	return c.JSON(fiber.Map{"success": true})
}

// MFAVerifyLogin is step 2 of login for an already-enrolled admin/teacher:
// submit the challengeId + factorId Login returned, plus the current TOTP
// code, to elevate the session to aal2.
func (d *Deps) MFAVerifyLogin(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	var body struct {
		FactorID    string `json:"factorId"`
		ChallengeID string `json:"challengeId"`
		Code        string `json:"code"`
	}
	if err := c.BodyParser(&body); err != nil || body.FactorID == "" || body.ChallengeID == "" || body.Code == "" {
		return c.JSON(fiber.Map{"success": false, "message": "factorId, challengeId, and code are required."})
	}

	session, err := d.DB.VerifyTOTP(user.SupabaseAccessToken, body.FactorID, body.ChallengeID, body.Code)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Incorrect or expired code."})
	}

	user.SupabaseAccessToken = session.AccessToken
	user.SupabaseRefreshToken = session.RefreshToken
	user.SupabaseExpiresAt = time.Now().Add(time.Duration(session.ExpiresIn) * time.Second).Unix()
	user.MFAVerified = true
	if err := middleware.IssueSession(c, d.Secret, *user); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Server error."})
	}

	return c.JSON(fiber.Map{"success": true, "role": user.Role, "name": user.Name})
}
