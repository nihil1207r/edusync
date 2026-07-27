package handlers

import (
	"fmt"
	"net/url"

	"github.com/gofiber/fiber/v2"
)

// GenerateMeetingPrep builds a parent-teacher meeting brief from the same
// underlying data as Invisible Parent (attendance/homework/wellness) and
// Silent Student Detector (participation pattern), plus recent grades. Like
// those features, this only restates what the data shows — it never
// diagnoses, and every achievement/concern/suggested action is traceable to
// a real number stored in source_data.
func (d *Deps) GenerateMeetingPrep(c *fiber.Ctx) error {
	var body struct {
		StudentID   string `json:"studentId"`
		MeetingDate string `json:"meetingDate"`
	}
	if err := c.BodyParser(&body); err != nil || body.StudentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId is required."})
	}
	if body.MeetingDate == "" {
		body.MeetingDate = todayDate()
	}
	db := d.UserDB(c)

	var student map[string]interface{}
	_ = db.SelectOne("students", url.Values{"select": {"name"}, "id": {"eq." + body.StudentID}}, &student)
	name, _ := student["name"].(string)
	if name == "" {
		name = "This student"
	}

	var attendance []map[string]interface{}
	_ = db.Select("attendance", url.Values{"select": {"status"}, "student_id": {"eq." + body.StudentID}, "limit": {"60"}, "order": {"date.desc"}}, &attendance)
	present := 0
	for _, a := range attendance {
		if s, _ := a["status"].(string); s == "present" {
			present++
		}
	}
	attendanceRate := 100.0
	if len(attendance) > 0 {
		attendanceRate = float64(present) / float64(len(attendance)) * 100
	}

	var homework []map[string]interface{}
	_ = db.Select("homework", url.Values{"select": {"id"}}, &homework)
	var submissions []map[string]interface{}
	_ = db.Select("homework_submissions", url.Values{"select": {"homework_id"}, "student_id": {"eq." + body.StudentID}}, &submissions)
	pending := len(homework) - len(submissions)
	if pending < 0 {
		pending = 0
	}

	var grades []map[string]interface{}
	_ = db.Select("grades", url.Values{"select": {"subject,marks,total"}, "student_id": {"eq." + body.StudentID}}, &grades)
	avgPct, gradeN := 0.0, 0
	bestSubject, bestPct := "", -1.0
	for _, g := range grades {
		marks, _ := g["marks"].(float64)
		total, _ := g["total"].(float64)
		if total <= 0 {
			continue
		}
		pct := marks / total * 100
		avgPct += pct
		gradeN++
		if pct > bestPct {
			bestPct, bestSubject = pct, fmt.Sprint(g["subject"])
		}
	}
	if gradeN > 0 {
		avgPct /= float64(gradeN)
	}

	var wellness []map[string]interface{}
	_ = db.Select("wellness", url.Values{"select": {"mood"}, "student_id": {"eq." + body.StudentID}, "order": {"created_at.desc"}, "limit": {"5"}}, &wellness)
	wellnessAvg, wellnessN := 0.0, 0
	for _, w := range wellness {
		if m, ok := w["mood"].(float64); ok {
			wellnessAvg += m
			wellnessN++
		}
	}
	if wellnessN > 0 {
		wellnessAvg /= float64(wellnessN)
	}

	var isolationFlags []map[string]interface{}
	_ = db.Select("peer_relationships", url.Values{
		"select": {"evidence_source"}, "student_a_id": {"eq." + body.StudentID},
		"relationship_type": {"eq.isolation_risk"}, "status": {"eq.accepted"}, "limit": {"1"},
	}, &isolationFlags)

	achievements := make([]string, 0)
	concerns := make([]string, 0)
	actions := make([]string, 0)

	if attendanceRate >= 90 {
		achievements = append(achievements, fmt.Sprintf("Attendance is strong at %.0f%% over the last %d recorded days.", attendanceRate, len(attendance)))
	} else if attendanceRate < 75 && len(attendance) > 0 {
		concerns = append(concerns, fmt.Sprintf("Attendance is %.0f%% over the last %d recorded days, below the 75%% mark.", attendanceRate, len(attendance)))
		actions = append(actions, "Ask about anything affecting regular attendance — transport, health, or something else.")
	}

	if pending == 0 && len(homework) > 0 {
		achievements = append(achievements, "All assigned homework is submitted.")
	} else if pending >= 3 {
		concerns = append(concerns, fmt.Sprintf("%d homework item(s) appear unsubmitted.", pending))
		actions = append(actions, "Check whether workload, time management, or support at home is the bottleneck.")
	}

	if gradeN > 0 {
		if avgPct >= 75 {
			achievements = append(achievements, fmt.Sprintf("Average exam performance is %.0f%%, strongest in %s (%.0f%%).", avgPct, bestSubject, bestPct))
		} else if avgPct < 50 {
			concerns = append(concerns, fmt.Sprintf("Average exam performance is %.0f%% across %d recorded result(s).", avgPct, gradeN))
			actions = append(actions, "Discuss which subjects need extra support and whether tutoring or revision time would help.")
		}
	}

	if wellnessN > 0 && wellnessAvg <= 2.5 {
		concerns = append(concerns, "Recent wellness check-ins have trended low.")
		actions = append(actions, "A gentle, open-ended check-in about how things are going outside academics may help.")
	}

	if len(isolationFlags) > 0 {
		concerns = append(concerns, "A participation pattern was flagged for a human check-in (see Friendship Intelligence) — not a diagnosis, just a pattern worth discussing.")
		actions = append(actions, "Consider whether a seating change or small-group pairing might help re-engage participation.")
	}

	if len(achievements) == 0 {
		achievements = append(achievements, "No standout metrics either way in the data available — a good open-ended check-in meeting.")
	}
	if len(actions) == 0 {
		actions = append(actions, "No specific action flagged by the data — a good opportunity for a general progress conversation.")
	}

	sourceData := fiber.Map{
		"attendanceRatePct": round1(attendanceRate), "attendanceSample": len(attendance),
		"homeworkPending": pending, "homeworkTotal": len(homework),
		"avgGradePct": round1(avgPct), "gradeSample": gradeN,
		"wellnessAvg": round1(wellnessAvg), "wellnessSample": wellnessN,
		"isolationFlag": len(isolationFlags) > 0,
	}

	_ = db.Insert("meeting_prep_docs", map[string]interface{}{
		"student_id": body.StudentID, "meeting_date": body.MeetingDate,
		"achievements": achievements, "concerns": concerns, "suggested_actions": actions,
		"source_data": sourceData, "generated_by": "rules",
	}, false, nil)

	return c.JSON(fiber.Map{
		"success": true, "studentName": name, "meetingDate": body.MeetingDate,
		"achievements": achievements, "concerns": concerns, "suggestedActions": actions,
		"sourceData": sourceData,
		"note":       "Drawn from attendance, homework, grades, wellness, and participation data already in the system — a prep aid, not a professional evaluation.",
	})
}

func (d *Deps) ListMeetingPrepDocs(c *fiber.Ctx) error {
	studentID := c.Query("studentId")
	if studentID == "" {
		if sid, _ := d.resolveStudentIDForUser(c); sid != "" {
			studentID = sid
		}
	}
	if studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId is required."})
	}
	var docs []map[string]interface{}
	_ = d.UserDB(c).Select("meeting_prep_docs", url.Values{
		"select": {"*"}, "student_id": {"eq." + studentID}, "order": {"generated_at.desc"}, "limit": {"10"},
	}, &docs)
	return c.JSON(fiber.Map{"success": true, "docs": orEmpty(docs)})
}
