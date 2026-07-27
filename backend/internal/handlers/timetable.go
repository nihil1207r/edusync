package handlers

import (
	"net/url"

	"github.com/gofiber/fiber/v2"
)

// ---- Timetable --------------------------------------------------------
// Read-only for everyone logged in (RLS enforces this too); writes are
// staff-only. A student/parent gets their own class's slots filtered
// server-side for convenience; admin/teacher can query any class.

func (d *Deps) ListTimetable(c *fiber.Ctx) error {
	class := c.Query("class")
	if class == "" {
		studentID, _ := d.resolveStudentIDForUser(c)
		if studentID != "" {
			var student map[string]interface{}
			_ = d.UserDB(c).SelectOne("students", url.Values{"select": {"class"}, "id": {"eq." + studentID}}, &student)
			class, _ = student["class"].(string)
		}
	}

	q := url.Values{"select": {"*"}, "order": {"day_of_week.asc,period.asc"}}
	if class != "" {
		q.Set("class", "eq."+class)
	}
	var slots []map[string]interface{}
	if err := d.UserDB(c).Select("timetable_slots", q, &slots); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "slots": orEmpty(slots)})
}

func (d *Deps) CreateTimetableSlot(c *fiber.Ctx) error {
	var body struct {
		Class       string `json:"class"`
		DayOfWeek   int    `json:"dayOfWeek"`
		Period      int    `json:"period"`
		Subject     string `json:"subject"`
		TeacherName string `json:"teacherName"`
		StartTime   string `json:"startTime"`
		EndTime     string `json:"endTime"`
	}
	if err := c.BodyParser(&body); err != nil || body.Class == "" || body.Subject == "" ||
		body.DayOfWeek < 1 || body.DayOfWeek > 6 || body.Period < 1 || body.StartTime == "" || body.EndTime == "" {
		return c.JSON(fiber.Map{"success": false, "message": "class, dayOfWeek (1-6), period, subject, startTime, and endTime are required."})
	}
	err := d.UserDB(c).Upsert("timetable_slots", []map[string]interface{}{{
		"class": body.Class, "day_of_week": body.DayOfWeek, "period": body.Period,
		"subject": body.Subject, "teacher_name": body.TeacherName,
		"start_time": body.StartTime, "end_time": body.EndTime,
	}}, "class,day_of_week,period", false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "timetable.upsert", "timetable_slots", "", fiber.Map{"after": body})
	return c.JSON(fiber.Map{"success": true})
}
