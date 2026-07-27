package handlers

import (
	"net/url"

	"github.com/gofiber/fiber/v2"
)

// Engagement logs are the brief's "one-tap-per-class signal" — a teacher's
// quick read on a student's participation/confidence/curiosity for a
// session. Not camera or biometric data. This feeds Friendship Intelligence
// and the Silent Student Detector.

func (d *Deps) CreateEngagementLog(c *fiber.Ctx) error {
	var body struct {
		StudentID     string `json:"studentId"`
		Class         string `json:"class"`
		Participation int    `json:"participation"`
		Confidence    int    `json:"confidence"`
		Curiosity     int    `json:"curiosity"`
		Notes         string `json:"notes"`
	}
	if err := c.BodyParser(&body); err != nil || body.StudentID == "" || body.Class == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId and class are required."})
	}
	curiosity := clamp15(body.Curiosity)
	err := d.UserDB(c).Insert("engagement_logs", map[string]interface{}{
		"student_id": body.StudentID, "class": body.Class,
		"participation": clamp15(body.Participation), "confidence": clamp15(body.Confidence),
		"curiosity": curiosity, "notes": body.Notes,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	bountyAwarded := false
	if curiosity >= curiosityBountyThreshold {
		bountyAwarded = d.awardCuriosityBounty(c, body.StudentID)
	}
	return c.JSON(fiber.Map{"success": true, "bountyAwarded": bountyAwarded})
}

func clamp15(v int) int {
	if v < 1 {
		return 1
	}
	if v > 5 {
		return 5
	}
	return v
}

// ListEngagementLogs: teacher sees a class's recent logs; family sees only
// their own child's (RLS enforces the latter regardless of what's queried).
func (d *Deps) ListEngagementLogs(c *fiber.Ctx) error {
	studentID := c.Query("studentId")
	if studentID == "" {
		if sid, _ := d.resolveStudentIDForUser(c); sid != "" {
			studentID = sid
		}
	}
	if studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId is required."})
	}
	var logs []map[string]interface{}
	_ = d.UserDB(c).Select("engagement_logs", url.Values{
		"select": {"*"}, "student_id": {"eq." + studentID}, "order": {"session_date.desc"}, "limit": {"20"},
	}, &logs)
	return c.JSON(fiber.Map{"success": true, "logs": orEmpty(logs)})
}
