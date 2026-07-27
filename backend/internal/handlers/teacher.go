package handlers

import (
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

func (d *Deps) TeacherDashboard(c *fiber.Ctx) error {
	var students []map[string]interface{}
	var announcements []map[string]interface{}
	var homework []map[string]interface{}
	var wellness []map[string]interface{}

	_ = d.UserDB(c).Select("students", url.Values{"select": {"*"}, "class": {"eq.10A"}}, &students)
	_ = d.UserDB(c).Select("announcements", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"5"}}, &announcements)
	_ = d.UserDB(c).Select("homework", url.Values{"select": {"*,homework_submissions(count)"}, "order": {"created_at.desc"}}, &homework)
	_ = d.UserDB(c).Select("wellness", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"20"}}, &wellness)

	sum := 0.0
	negativeMoods := 0
	for _, w := range wellness {
		if m, ok := w["mood"].(float64); ok {
			sum += m
			if m <= 2 {
				negativeMoods++
			}
		}
	}
	avgMood := "0"
	if len(wellness) > 0 {
		avgMood = trimFloat(sum / float64(len(wellness)))
	}

	return c.JSON(fiber.Map{
		"success": true, "students": orEmpty(students), "announcements": orEmpty(announcements),
		"homework": orEmpty(homework), "avgMood": avgMood, "negativeMoods": negativeMoods,
	})
}

func (d *Deps) TeacherStudents(c *fiber.Ctx) error {
	var students []map[string]interface{}
	_ = d.UserDB(c).Select("students", url.Values{"select": {"*,grades(*),attendance(*)"}, "class": {"eq.10A"}}, &students)
	return c.JSON(fiber.Map{"success": true, "students": orEmpty(students)})
}

func (d *Deps) PostAttendance(c *fiber.Ctx) error {
	var body struct {
		Attendance []struct {
			StudentID string `json:"studentId"`
			Status    string `json:"status"`
		} `json:"attendance"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}
	today := todayDate()
	rows := make([]map[string]interface{}, 0, len(body.Attendance))
	for _, a := range body.Attendance {
		rows = append(rows, map[string]interface{}{"student_id": a.StudentID, "date": today, "status": a.Status})
	}
	if err := d.UserDB(c).Upsert("attendance", rows, "student_id,date", false, nil); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) PostAnnouncement(c *fiber.Ctx) error {
	var body struct {
		Title     string `json:"title"`
		Message   string `json:"message"`
		Important bool   `json:"important"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Insert("announcements", map[string]interface{}{
		"title": body.Title, "message": body.Message, "important": body.Important,
		"by_id": user.ID, "by_name": user.Name,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) PostHomework(c *fiber.Ctx) error {
	var body struct {
		Title       string `json:"title"`
		Subject     string `json:"subject"`
		Description string `json:"description"`
		DueDate     string `json:"dueDate"`
		Points      int    `json:"points"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}
	if body.Points == 0 {
		body.Points = 50
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Insert("homework", map[string]interface{}{
		"title": body.Title, "subject": body.Subject, "description": body.Description,
		"due_date": body.DueDate, "points": body.Points, "by_id": user.ID,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) GetGatepasses(c *fiber.Ctx) error {
	var passes []map[string]interface{}
	_ = d.UserDB(c).Select("gatepasses", url.Values{"select": {"*"}, "order": {"created_at.desc"}}, &passes)
	return c.JSON(fiber.Map{"success": true, "passes": orEmpty(passes)})
}

func (d *Deps) UpdateGatepass(c *fiber.Ctx) error {
	var body struct {
		PassID string `json:"passId"`
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Update("gatepasses", url.Values{"id": {"eq." + body.PassID}}, map[string]interface{}{
		"status": body.Status, "approved_by": user.Name,
	})
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "gatepass.update", "gatepasses", body.PassID, fiber.Map{"after": fiber.Map{"status": body.Status}})
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) WellnessAll(c *fiber.Ctx) error {
	var wellness []map[string]interface{}
	_ = d.UserDB(c).Select("wellness", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"50"}}, &wellness)
	return c.JSON(fiber.Map{"success": true, "wellness": orEmpty(wellness)})
}
