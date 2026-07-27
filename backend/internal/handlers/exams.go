package handlers

import (
	"fmt"
	"net/url"

	"github.com/gofiber/fiber/v2"
)

// ---- Exams (schedule) ---------------------------------------------------

func (d *Deps) ListExams(c *fiber.Ctx) error {
	class := c.Query("class")
	if class == "" {
		studentID, _ := d.resolveStudentIDForUser(c)
		if studentID != "" {
			var student map[string]interface{}
			_ = d.UserDB(c).SelectOne("students", url.Values{"select": {"class"}, "id": {"eq." + studentID}}, &student)
			class, _ = student["class"].(string)
		}
	}
	q := url.Values{"select": {"*"}, "order": {"exam_date.asc"}}
	if class != "" {
		q.Set("class", "eq."+class)
	}
	var exams []map[string]interface{}
	if err := d.UserDB(c).Select("exams", q, &exams); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "exams": orEmpty(exams)})
}

func (d *Deps) CreateExam(c *fiber.Ctx) error {
	var body struct {
		Class    string  `json:"class"`
		Subject  string  `json:"subject"`
		ExamDate string  `json:"examDate"`
		MaxMarks float64 `json:"maxMarks"`
		Term     string  `json:"term"`
	}
	if err := c.BodyParser(&body); err != nil || body.Class == "" || body.Subject == "" || body.ExamDate == "" {
		return c.JSON(fiber.Map{"success": false, "message": "class, subject, and examDate are required."})
	}
	if body.MaxMarks <= 0 {
		body.MaxMarks = 100
	}
	var created []map[string]interface{}
	err := d.UserDB(c).Insert("exams", map[string]interface{}{
		"class": body.Class, "subject": body.Subject, "exam_date": body.ExamDate,
		"max_marks": body.MaxMarks, "term": body.Term,
	}, true, &created)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "exam.create", "exams", "", fiber.Map{"after": body})
	return c.JSON(fiber.Map{"success": true, "exam": firstOrNil(created)})
}

// ---- Results (grade entry against an exam) ------------------------------
// Reuses the existing `grades` table (student_id, subject, marks, total,
// grade) rather than a parallel `results` table — same underlying data,
// now optionally linked to a specific exam via grades.exam_id. This is the
// grade-override write path NOTES.md flagged as missing; every write is
// audit-logged with actor + diff per the section 5 security baseline.

func (d *Deps) ListResultsForExam(c *fiber.Ctx) error {
	examID := c.Query("examId")
	if examID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "examId is required."})
	}
	var rows []map[string]interface{}
	_ = d.UserDB(c).Select("grades", url.Values{"select": {"*,students(name,roll_no)"}, "exam_id": {"eq." + examID}}, &rows)
	return c.JSON(fiber.Map{"success": true, "results": orEmpty(rows)})
}

func (d *Deps) UpsertResult(c *fiber.Ctx) error {
	var body struct {
		ExamID    string  `json:"examId"`
		StudentID string  `json:"studentId"`
		Subject   string  `json:"subject"`
		Marks     float64 `json:"marks"`
		Total     float64 `json:"total"`
	}
	if err := c.BodyParser(&body); err != nil || body.ExamID == "" || body.StudentID == "" || body.Subject == "" {
		return c.JSON(fiber.Map{"success": false, "message": "examId, studentId, and subject are required."})
	}
	if body.Total <= 0 {
		body.Total = 100
	}
	grade := letterGrade(body.Marks, body.Total)

	err := d.UserDB(c).Upsert("grades", []map[string]interface{}{{
		"exam_id": body.ExamID, "student_id": body.StudentID, "subject": body.Subject,
		"marks": body.Marks, "total": body.Total, "grade": grade,
	}}, "student_id,subject,exam_id", false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "result.upsert", "grades", body.StudentID, fiber.Map{
		"after": fiber.Map{"examId": body.ExamID, "subject": body.Subject, "marks": body.Marks, "total": body.Total},
	})

	// Best-effort School Memory auto-index (Phase 3) — not fatal if it fails.
	_ = d.UserDB(c).Insert("school_events_index", map[string]interface{}{
		"student_id": body.StudentID, "event_type": "exam",
		"description": fmt.Sprintf("Scored %.0f/%.0f (%s) in %s", body.Marks, body.Total, grade, body.Subject),
		"source_table": "grades",
	}, false, nil)

	return c.JSON(fiber.Map{"success": true, "grade": grade})
}

func letterGrade(marks, total float64) string {
	if total <= 0 {
		return "-"
	}
	pct := marks / total * 100
	switch {
	case pct >= 90:
		return "A+"
	case pct >= 80:
		return "A"
	case pct >= 70:
		return "B"
	case pct >= 60:
		return "C"
	case pct >= 50:
		return "D"
	default:
		return "F"
	}
}

func firstOrNil(rows []map[string]interface{}) map[string]interface{} {
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}
