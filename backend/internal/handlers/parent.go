package handlers

import (
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

func (d *Deps) ParentDashboard(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)

	var profile profileRow
	if err := d.UserDB(c).SelectOne("profiles", url.Values{"select": {"*"}, "id": {"eq." + user.ID}}, &profile); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "No child linked."})
	}
	childID := profile.ChildID
	if childID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No child linked."})
	}

	var student map[string]interface{}
	var grades []map[string]interface{}
	var attendance []map[string]interface{}
	var announcements []map[string]interface{}
	var wellness []map[string]interface{}

	_ = d.UserDB(c).SelectOne("students", url.Values{"select": {"*"}, "id": {"eq." + childID}}, &student)
	_ = d.UserDB(c).Select("grades", url.Values{"select": {"*"}, "student_id": {"eq." + childID}}, &grades)
	_ = d.UserDB(c).Select("attendance", url.Values{"select": {"*"}, "student_id": {"eq." + childID}, "order": {"date.desc"}, "limit": {"14"}}, &attendance)
	_ = d.UserDB(c).Select("announcements", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"5"}}, &announcements)
	_ = d.UserDB(c).Select("wellness", url.Values{"select": {"*"}, "student_id": {"eq." + childID}, "order": {"created_at.desc"}, "limit": {"7"}}, &wellness)

	attendance = orEmpty(attendance)
	presentDays := 0
	for _, a := range attendance {
		if a["status"] == "present" {
			presentDays++
		}
	}
	attendancePct := 0
	if len(attendance) > 0 {
		attendancePct = int(round(float64(presentDays) / float64(len(attendance)) * 100))
	}

	grades = orEmpty(grades)
	avgGrade := 0
	if len(grades) > 0 {
		sum := 0.0
		for _, g := range grades {
			if m, ok := g["marks"].(float64); ok {
				sum += m
			}
		}
		avgGrade = int(round(sum / float64(len(grades))))
	}

	return c.JSON(fiber.Map{
		"success": true, "student": student, "grades": grades, "attendance": attendance,
		"announcements": orEmpty(announcements), "wellness": orEmpty(wellness),
		"attendancePct": attendancePct, "avgGrade": avgGrade,
	})
}

func round(f float64) float64 {
	if f < 0 {
		return -round(-f)
	}
	return float64(int(f + 0.5))
}
