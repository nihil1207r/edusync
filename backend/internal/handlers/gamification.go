package handlers

import (
	"fmt"
	"net/url"
	"sort"
	"time"

	"edunexus/backend/internal/supabase"
	"github.com/gofiber/fiber/v2"
)

// This file adds four gamification mechanics on top of data this app
// already collects — no fabricated scores, nothing invented. All of it is
// scoped to the core student-motivation experience (points/badges), kept
// deliberately separate from the AI Insight Layer, which stays calm/
// non-gamified per the brief's own instruction (see DailySummaryCard).

// ── Curiosity bounty ──────────────────────────────────────────────────
// Rewards a specific, previously-uncelebrated signal: engagement_logs
// already captures curiosity separately from participation, but nothing
// used to act on it. A high curiosity rating from a teacher now earns a
// small, repeatable points bonus — logged to school_events_index so it
// shows up in the student's own history, not just a silent number change.

const (
	curiosityBountyThreshold = 4  // curiosity rating (1-5) that triggers a bounty
	curiosityBountyPoints    = 10 // points awarded per bounty
)

// awardCuriosityBounty adds points and logs the award. Best-effort — a
// failure here shouldn't fail the underlying engagement-log request.
func (d *Deps) awardCuriosityBounty(c *fiber.Ctx, studentID string) bool {
	db := d.UserDB(c)
	if err := addStudentPoints(db, studentID, curiosityBountyPoints); err != nil {
		return false
	}
	_ = db.Insert("school_events_index", map[string]interface{}{
		"student_id": studentID, "event_type": "achievement",
		"description":  fmt.Sprintf("Curiosity bounty: +%d points for an engaged, question-asking session.", curiosityBountyPoints),
		"source_table": "engagement_logs",
	}, false, nil)
	return true
}

func addStudentPoints(db *supabase.Client, studentID string, delta int) error {
	var student map[string]interface{}
	if err := db.SelectOne("students", url.Values{"select": {"points"}, "id": {"eq." + studentID}}, &student); err != nil {
		return err
	}
	current := 0
	if p, ok := student["points"].(float64); ok {
		current = int(p)
	}
	return db.Update("students", url.Values{"id": {"eq." + studentID}}, map[string]interface{}{"points": current + delta})
}

// ListCuriosityBounties: a student/parent's recent bounty history plus a
// running total, for a small "curiosity bounties" panel on the dashboard.
func (d *Deps) ListCuriosityBounties(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	var events []map[string]interface{}
	_ = d.UserDB(c).Select("school_events_index", url.Values{
		"select": {"*"}, "student_id": {"eq." + studentID}, "source_table": {"eq.engagement_logs"},
		"order": {"created_at.desc"}, "limit": {"20"},
	}, &events)
	return c.JSON(fiber.Map{"success": true, "bounties": orEmpty(events), "totalCount": len(events)})
}

// ── Skill tree ───────────────────────────────────────────────────────
// Builds a real tree from real data rather than a fabricated curriculum
// graph: nodes are a subject's actual exam results in chronological order
// (grades.exam_id → exams.exam_date, added in Phase 1's migration 005).
// A node is "mastered" at 80%+, "cleared" otherwise, and the result after
// the most recent one is "current" — everything after that is "locked"
// until an exam actually happens. No invented prerequisites.

type skillNode struct {
	ExamID     string `json:"examId,omitempty"`
	Subject    string `json:"subject"`
	Label      string `json:"label"`
	MasteryPct int    `json:"masteryPct"`
	Status     string `json:"status"` // mastered | cleared | current | locked
}

func (d *Deps) SkillTree(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	db := d.UserDB(c)

	var grades []map[string]interface{}
	_ = db.Select("grades", url.Values{
		"select": {"*,exams(subject,exam_date,term)"}, "student_id": {"eq." + studentID},
	}, &grades)

	bySubject := map[string][]map[string]interface{}{}
	for _, g := range grades {
		subject, _ := g["subject"].(string)
		bySubject[subject] = append(bySubject[subject], g)
	}

	tree := make(map[string][]skillNode)
	for subject, rows := range bySubject {
		sort.Slice(rows, func(i, j int) bool {
			return examDateOf(rows[i]) < examDateOf(rows[j])
		})
		nodes := make([]skillNode, 0, len(rows))
		for i, g := range rows {
			marks, _ := g["marks"].(float64)
			total, _ := g["total"].(float64)
			pct := 0
			if total > 0 {
				pct = int(marks/total*100 + 0.5)
			}
			status := "cleared"
			if pct >= 80 {
				status = "mastered"
			}
			if i == len(rows)-1 {
				status = "current"
			}
			label := fmt.Sprintf("Result %d", i+1)
			if exam, ok := g["exams"].(map[string]interface{}); ok && exam != nil {
				if term, ok := exam["term"].(string); ok && term != "" {
					label = term
				}
			}
			examID, _ := g["exam_id"].(string)
			nodes = append(nodes, skillNode{ExamID: examID, Subject: subject, Label: label, MasteryPct: pct, Status: status})
		}
		// One locked "next" node per subject — a visible goal, not a real
		// scheduled exam (a real one replaces it once it exists).
		nodes = append(nodes, skillNode{Subject: subject, Label: "Next result", MasteryPct: 0, Status: "locked"})
		tree[subject] = nodes
	}

	return c.JSON(fiber.Map{"success": true, "tree": tree})
}

func examDateOf(g map[string]interface{}) string {
	if exam, ok := g["exams"].(map[string]interface{}); ok && exam != nil {
		if d, ok := exam["exam_date"].(string); ok {
			return d
		}
	}
	if created, ok := g["created_at"].(string); ok {
		return created
	}
	return ""
}

// ── Commute streak ───────────────────────────────────────────────────
// Consecutive calendar days with a real 'boarded' boarding_event, ending
// today or yesterday (yesterday still counts as "current" so a streak
// doesn't visually reset before the student has even had a chance to ride
// the bus today). Milestone badges are appended to students.badges the
// first time they're reached — checked against the existing badge list so
// re-computing the streak never double-awards.

var commuteMilestones = []struct {
	days  int
	badge string
}{
	{5, "🔥 5-Day Rider"},
	{10, "🚌 10-Day Rider"},
	{20, "🚍 20-Day Rider"},
	{50, "🏅 50-Day Rider"},
}

func (d *Deps) CommuteStreak(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	db := d.UserDB(c)

	var events []map[string]interface{}
	_ = db.Select("boarding_events", url.Values{
		"select": {"created_at"}, "student_id": {"eq." + studentID}, "event": {"eq.boarded"},
		"order": {"created_at.desc"}, "limit": {"200"},
	}, &events)

	days := map[string]bool{}
	for _, e := range events {
		if ts, ok := e["created_at"].(string); ok && len(ts) >= 10 {
			days[ts[:10]] = true
		}
	}

	streak := 0
	cursor := time.Now()
	if !days[cursor.Format("2006-01-02")] {
		cursor = cursor.AddDate(0, 0, -1) // today not ridden yet — start counting from yesterday instead
	}
	for days[cursor.Format("2006-01-02")] {
		streak++
		cursor = cursor.AddDate(0, 0, -1)
	}

	newBadge := maybeAwardStreakBadge(db, studentID, streak)

	return c.JSON(fiber.Map{"success": true, "streakDays": streak, "newBadge": newBadge})
}

func maybeAwardStreakBadge(db *supabase.Client, studentID string, streak int) string {
	target := highestReachedMilestone(streak)
	if target == "" {
		return ""
	}
	var student map[string]interface{}
	if err := db.SelectOne("students", url.Values{"select": {"badges"}, "id": {"eq." + studentID}}, &student); err != nil {
		return ""
	}
	badges, _ := student["badges"].([]interface{})
	for _, b := range badges {
		if s, ok := b.(string); ok && s == target {
			return "" // already have it
		}
	}
	badges = append(badges, target)
	if err := db.Update("students", url.Values{"id": {"eq." + studentID}}, map[string]interface{}{"badges": badges}); err != nil {
		return ""
	}
	return target
}

// highestReachedMilestone is the pure part of the badge-awarding logic
// (no DB access), split out so it's unit-testable on its own.
func highestReachedMilestone(streak int) string {
	var target string
	for _, m := range commuteMilestones {
		if streak >= m.days {
			target = m.badge
		}
	}
	return target
}

// ── You vs. past-you ─────────────────────────────────────────────────
// Compares this calendar month to last calendar month for the SAME
// student only — never against classmates — on three real metrics:
// attendance rate, homework submission rate, and average grade %.

func (d *Deps) ProgressComparison(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	db := d.UserDB(c)

	now := time.Now()
	thisStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	lastStart := thisStart.AddDate(0, -1, 0)

	thisMonth := monthlyMetrics(db, studentID, thisStart, now)
	lastMonth := monthlyMetrics(db, studentID, lastStart, thisStart)

	return c.JSON(fiber.Map{
		"success": true, "thisMonth": thisMonth, "lastMonth": lastMonth,
		"note": "Compared against your own past performance only — never against classmates.",
	})
}

type monthMetrics struct {
	AttendanceRatePct float64 `json:"attendanceRatePct"`
	HomeworkOnTimePct float64 `json:"homeworkOnTimePct"`
	AvgGradePct       float64 `json:"avgGradePct"`
}

func monthlyMetrics(db *supabase.Client, studentID string, from, to time.Time) monthMetrics {
	fromDate, toDate := from.Format("2006-01-02"), to.Format("2006-01-02")
	fromTS, toTS := from.Format(time.RFC3339), to.Format(time.RFC3339)

	var attendance []map[string]interface{}
	aq := url.Values{"select": {"status"}, "student_id": {"eq." + studentID}}
	aq.Add("date", "gte."+fromDate)
	aq.Add("date", "lt."+toDate)
	_ = db.Select("attendance", aq, &attendance)

	present := 0
	for _, a := range attendance {
		if s, _ := a["status"].(string); s == "present" {
			present++
		}
	}
	attRate := 0.0
	if len(attendance) > 0 {
		attRate = float64(present) / float64(len(attendance)) * 100
	}

	var submissions []map[string]interface{}
	sq := url.Values{"select": {"submitted_at"}, "student_id": {"eq." + studentID}}
	sq.Add("submitted_at", "gte."+fromTS)
	sq.Add("submitted_at", "lt."+toTS)
	_ = db.Select("homework_submissions", sq, &submissions)

	var homeworkInWindow []map[string]interface{}
	hq := url.Values{"select": {"id"}}
	hq.Add("due_date", "gte."+fromTS)
	hq.Add("due_date", "lt."+toTS)
	_ = db.Select("homework", hq, &homeworkInWindow)

	hwRate := 0.0
	if len(homeworkInWindow) > 0 {
		hwRate = float64(len(submissions)) / float64(len(homeworkInWindow)) * 100
		if hwRate > 100 {
			hwRate = 100
		}
	}

	var grades []map[string]interface{}
	gq := url.Values{"select": {"marks,total"}, "student_id": {"eq." + studentID}}
	gq.Add("created_at", "gte."+fromTS)
	gq.Add("created_at", "lt."+toTS)
	_ = db.Select("grades", gq, &grades)

	gradeSum, gradeN := 0.0, 0
	for _, g := range grades {
		marks, _ := g["marks"].(float64)
		total, _ := g["total"].(float64)
		if total > 0 {
			gradeSum += marks / total * 100
			gradeN++
		}
	}
	avgGrade := 0.0
	if gradeN > 0 {
		avgGrade = gradeSum / float64(gradeN)
	}

	return monthMetrics{
		AttendanceRatePct: round1(attRate),
		HomeworkOnTimePct: round1(hwRate),
		AvgGradePct:       round1(avgGrade),
	}
}
