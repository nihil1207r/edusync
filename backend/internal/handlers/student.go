package handlers

import (
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

func (d *Deps) StudentDashboard(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)

	var profile map[string]interface{}
	if err := d.UserDB(c).SelectOne("profiles", url.Values{"select": {"*"}, "id": {"eq." + user.ID}}, &profile); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Student record not linked."})
	}
	childID, _ := profile["child_id"].(string)
	if childID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "Student record not linked."})
	}

	var grades []map[string]interface{}
	var attendance []map[string]interface{}
	var homework []map[string]interface{}
	var announcements []map[string]interface{}
	var submissions []map[string]interface{}
	var student map[string]interface{}

	_ = d.UserDB(c).Select("grades", url.Values{"select": {"*"}, "student_id": {"eq." + childID}}, &grades)
	_ = d.UserDB(c).Select("attendance", url.Values{"select": {"*"}, "student_id": {"eq." + childID}, "order": {"date.desc"}, "limit": {"7"}}, &attendance)
	_ = d.UserDB(c).Select("homework", url.Values{"select": {"*"}, "order": {"due_date.asc"}}, &homework)
	_ = d.UserDB(c).Select("announcements", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"5"}}, &announcements)
	_ = d.UserDB(c).Select("homework_submissions", url.Values{"select": {"homework_id"}, "student_id": {"eq." + childID}}, &submissions)
	_ = d.UserDB(c).SelectOne("students", url.Values{"select": {"*"}, "id": {"eq." + childID}}, &student)

	merged := map[string]interface{}{}
	for k, v := range profile {
		merged[k] = v
	}
	for k, v := range student {
		merged[k] = v
	}

	submittedIDs := make([]interface{}, 0, len(submissions))
	for _, s := range submissions {
		submittedIDs = append(submittedIDs, s["homework_id"])
	}

	return c.JSON(fiber.Map{
		"success": true, "profile": merged, "grades": orEmpty(grades), "attendance": orEmpty(attendance),
		"homework": orEmpty(homework), "announcements": orEmpty(announcements), "submittedIds": submittedIDs,
	})
}

func (d *Deps) PostWellness(c *fiber.Ctx) error {
	var body struct {
		Mood    int    `json:"mood"`
		Message string `json:"message"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}
	sentiment := "negative"
	if body.Mood >= 4 {
		sentiment = "positive"
	} else if body.Mood == 3 {
		sentiment = "neutral"
	}

	user := middleware.UserFromLocals(c)
	var profile map[string]interface{}
	_ = d.UserDB(c).SelectOne("profiles", url.Values{"select": {"child_id"}, "id": {"eq." + user.ID}}, &profile)
	childID, _ := profile["child_id"].(string)

	err := d.UserDB(c).Insert("wellness", map[string]interface{}{
		"student_id": childID, "mood": body.Mood, "message": body.Message,
		"sentiment": sentiment, "anonymous": true,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) SubmitHomework(c *fiber.Ctx) error {
	var body struct {
		HomeworkID string `json:"homeworkId"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}

	user := middleware.UserFromLocals(c)
	var profile map[string]interface{}
	_ = d.UserDB(c).SelectOne("profiles", url.Values{"select": {"child_id"}, "id": {"eq." + user.ID}}, &profile)
	studentID, _ := profile["child_id"].(string)

	if err := d.UserDB(c).Upsert("homework_submissions", map[string]interface{}{
		"homework_id": body.HomeworkID, "student_id": studentID,
	}, "homework_id,student_id", false, nil); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	var hw map[string]interface{}
	_ = d.UserDB(c).SelectOne("homework", url.Values{"select": {"points"}, "id": {"eq." + body.HomeworkID}}, &hw)
	points := 50
	if p, ok := hw["points"].(float64); ok {
		points = int(p)
	}

	var student map[string]interface{}
	_ = d.UserDB(c).SelectOne("students", url.Values{"select": {"points"}, "id": {"eq." + studentID}}, &student)
	current := 0
	if p, ok := student["points"].(float64); ok {
		current = int(p)
	}

	if err := d.UserDB(c).Update("students", url.Values{"id": {"eq." + studentID}}, map[string]interface{}{
		"points": current + points,
	}); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "pointsEarned": points})
}

func (d *Deps) PostGatepass(c *fiber.Ctx) error {
	var body struct {
		Reason   string `json:"reason"`
		ExitTime string `json:"exitTime"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Insert("gatepasses", map[string]interface{}{
		"student_id": user.ID, "student_name": user.Name,
		"reason": body.Reason, "exit_time": body.ExitTime, "status": "pending",
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}
