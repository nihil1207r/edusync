package handlers

import (
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// ---- Notices (audience-targeted announcements) -----------------------------
// Reuses the existing `announcements` table (now with audience/audience_value
// columns) rather than a separate `notices` table — same underlying feature.

func (d *Deps) PostNotice(c *fiber.Ctx) error {
	var body struct {
		Title         string `json:"title"`
		Message       string `json:"message"`
		Important     bool   `json:"important"`
		Audience      string `json:"audience"`      // school | class | role
		AudienceValue string `json:"audienceValue"` // e.g. "10A" or "parent"
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}
	if body.Audience == "" {
		body.Audience = "school"
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Insert("announcements", map[string]interface{}{
		"title": body.Title, "message": body.Message, "important": body.Important,
		"by_id": user.ID, "by_name": user.Name,
		"audience": body.Audience, "audience_value": body.AudienceValue,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// GetNotices returns notices relevant to the logged-in user: school-wide,
// their class (if set), or their role.
func (d *Deps) GetNotices(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	var all []map[string]interface{}
	_ = d.UserDB(c).Select("announcements", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"50"}}, &all)

	filtered := make([]map[string]interface{}, 0, len(all))
	for _, n := range all {
		audience, _ := n["audience"].(string)
		value, _ := n["audience_value"].(string)
		switch audience {
		case "class":
			if value == user.Class {
				filtered = append(filtered, n)
			}
		case "role":
			if value == user.Role {
				filtered = append(filtered, n)
			}
		default: // "school" or unset (legacy rows)
			filtered = append(filtered, n)
		}
	}
	return c.JSON(fiber.Map{"success": true, "notices": filtered})
}

// ---- Leave requests ---------------------------------------------------------

func (d *Deps) ApplyLeave(c *fiber.Ctx) error {
	var body struct {
		FromDate string `json:"fromDate"`
		ToDate   string `json:"toDate"`
		Reason   string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil || body.FromDate == "" || body.ToDate == "" || body.Reason == "" {
		return c.JSON(fiber.Map{"success": false, "message": "fromDate, toDate, and reason are required."})
	}
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	err = d.UserDB(c).Insert("leave_requests", map[string]interface{}{
		"student_id": studentID, "from_date": body.FromDate, "to_date": body.ToDate, "reason": body.Reason,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) ChildLeaveRequests(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	var requests []map[string]interface{}
	_ = d.UserDB(c).Select("leave_requests", url.Values{"select": {"*"}, "student_id": {"eq." + studentID}, "order": {"created_at.desc"}}, &requests)
	return c.JSON(fiber.Map{"success": true, "requests": orEmpty(requests)})
}

func (d *Deps) TeacherLeaveRequests(c *fiber.Ctx) error {
	var requests []map[string]interface{}
	_ = d.UserDB(c).Select("leave_requests", url.Values{"select": {"*,students(name,roll_no,class)"}, "order": {"created_at.desc"}}, &requests)
	return c.JSON(fiber.Map{"success": true, "requests": orEmpty(requests)})
}

func (d *Deps) UpdateLeaveRequest(c *fiber.Ctx) error {
	var body struct {
		RequestID string `json:"requestId"`
		Status    string `json:"status"` // approved | denied
	}
	if err := c.BodyParser(&body); err != nil || body.RequestID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "requestId is required."})
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Update("leave_requests", url.Values{"id": {"eq." + body.RequestID}}, map[string]interface{}{
		"status": body.Status, "approved_by": user.Name,
	})
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "leave.update", "leave_requests", body.RequestID, fiber.Map{"after": fiber.Map{"status": body.Status}})
	return c.JSON(fiber.Map{"success": true})
}
