package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"edunexus/backend/internal/middleware"
	"edunexus/backend/internal/supabase"
	"github.com/gofiber/fiber/v2"
)

// ---------------------------------------------------------------------------
// "Teams-style" homework, Phase 7: a student attaches a PDF and turns it in
// with a real submitted-at timestamp; a teacher sees a roster (not turned
// in / turned in at <time> / graded) and can mark it; and — the new part —
// an AI pass (Gemini, same GEMINI_API_KEY / same honest rules-fallback
// pattern as generateSummaryViaLLM in insight.go) reads the submitted PDF
// against the homework's own title/subject/description/points and returns:
// a suggested score, what the student got wrong (as both a friendly
// paragraph and short machine-comparable "mistake tags"), and what they did
// well. Teachers get those mistake tags aggregated across the whole class
// so a mistake three students made independently reads as "cover this in
// class," not three unrelated notes.
//
// Grading a PDF takes a few seconds, so it runs in a background goroutine
// right after submission rather than blocking the student's "submitted!"
// response — see evaluateSubmissionInBackground. That goroutine uses the
// service-role DB client (d.DB), never d.UserDB(c): the *fiber.Ctx and the
// request-scoped user token it depends on are no longer valid once the
// HTTP handler has already returned.
// ---------------------------------------------------------------------------

const maxSubmissionBase64Len = 12_000_000 // ~9MB decoded — generous for a homework PDF, small enough for a Postgres text column + PostgREST's payload limit

// SubmitHomework now accepts (and requires) a PDF attachment: fileBase64
// (no "data:application/pdf;base64," prefix — just the raw base64) and
// fileName. It stores the submission with a real submitted_at, then kicks
// off AI evaluation in the background rather than making the student wait.
func (d *Deps) SubmitHomework(c *fiber.Ctx) error {
	var body struct {
		HomeworkID string `json:"homeworkId"`
		FileBase64 string `json:"fileBase64"`
		FileName   string `json:"fileName"`
	}
	if err := c.BodyParser(&body); err != nil || body.HomeworkID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "homeworkId is required."})
	}
	body.FileBase64 = strings.TrimPrefix(body.FileBase64, "data:application/pdf;base64,")
	if body.FileBase64 == "" || body.FileName == "" {
		return c.JSON(fiber.Map{"success": false, "message": "Attach your homework as a PDF before submitting."})
	}
	if len(body.FileBase64) > maxSubmissionBase64Len {
		return c.JSON(fiber.Map{"success": false, "message": "That PDF is too large (max ~9MB). Try compressing it and submit again."})
	}
	decoded, err := base64.StdEncoding.DecodeString(body.FileBase64)
	if err != nil || len(decoded) < 4 || string(decoded[:4]) != "%PDF" {
		return c.JSON(fiber.Map{"success": false, "message": "That doesn't look like a valid PDF file."})
	}

	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}

	var homework map[string]interface{}
	if err := d.UserDB(c).SelectOne("homework", url.Values{
		"select": {"title,subject,description,points"}, "id": {"eq." + body.HomeworkID},
	}, &homework); err != nil || homework == nil {
		return c.JSON(fiber.Map{"success": false, "message": "Homework not found."})
	}

	var created []map[string]interface{}
	if err := d.UserDB(c).Upsert("homework_submissions", []map[string]interface{}{{
		"homework_id": body.HomeworkID, "student_id": studentID,
		"file_name": body.FileName, "file_base64": body.FileBase64, "file_size_bytes": len(decoded),
		"submitted_at": time.Now().Format(time.RFC3339), "status": "submitted",
		// Clear any previous grading/AI results — this is a fresh attempt
		// (e.g. a resubmission before the due date), not an amendment to the old one.
		"marks_awarded": nil, "graded_by": nil, "graded_at": nil,
		"ai_suggested_score": nil, "ai_feedback": nil, "ai_mistake_tags": nil,
		"ai_mistakes": nil, "ai_strengths": nil, "ai_generated_by": nil, "ai_evaluated_at": nil,
	}}, "homework_id,student_id", true, &created); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	points := 50
	if p, ok := homework["points"].(float64); ok && p > 0 {
		points = int(p)
	}
	var student map[string]interface{}
	_ = d.UserDB(c).SelectOne("students", url.Values{"select": {"points"}, "id": {"eq." + studentID}}, &student)
	current := 0
	if p, ok := student["points"].(float64); ok {
		current = int(p)
	}
	_ = d.UserDB(c).Update("students", url.Values{"id": {"eq." + studentID}}, map[string]interface{}{"points": current + points})

	submission := firstOrNil(created)
	if submission != nil {
		if subID, ok := submission["id"].(string); ok {
			title, _ := homework["title"].(string)
			subject, _ := homework["subject"].(string)
			description, _ := homework["description"].(string)
			go evaluateSubmissionInBackground(d.DB, subID, body.FileBase64, title, subject, description, points)
		}
	}

	return c.JSON(fiber.Map{"success": true, "pointsEarned": points, "submission": submission})
}

// GetHomeworkSubmissions is the teacher's roster view for one homework:
// every student in the class, whether/when they turned it in, whether it's
// late, marks, and a short slice of the AI evaluation. Deliberately leaves
// out file_base64/ai_mistakes (the heavy fields) — use GetSubmissionFile
// and GetHomeworkClassInsight for those, so loading a roster of 40 students
// doesn't ship 40 PDFs' worth of base64 every time.
func (d *Deps) GetHomeworkSubmissions(c *fiber.Ctx) error {
	homeworkID := c.Query("homeworkId")
	if homeworkID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "homeworkId is required."})
	}
	db := d.UserDB(c)

	var homework map[string]interface{}
	if err := db.SelectOne("homework", url.Values{"select": {"*"}, "id": {"eq." + homeworkID}}, &homework); err != nil || homework == nil {
		return c.JSON(fiber.Map{"success": false, "message": "Homework not found."})
	}
	class, _ := homework["class"].(string)
	if class == "" {
		class = d.classForUser(c)
	}
	dueDate, _ := homework["due_date"].(string)

	var students []map[string]interface{}
	_ = db.Select("students", url.Values{"select": {"id,name,roll_no"}, "class": {"eq." + class}, "order": {"roll_no.asc"}}, &students)

	var submissions []map[string]interface{}
	_ = db.Select("homework_submissions", url.Values{
		"select":      {"id,student_id,submitted_at,marks_awarded,graded_by,graded_at,ai_suggested_score,ai_feedback,ai_mistake_tags,ai_generated_by,ai_evaluated_at,file_name"},
		"homework_id": {"eq." + homeworkID},
	}, &submissions)
	byStudent := map[string]map[string]interface{}{}
	for _, s := range submissions {
		if sid, ok := s["student_id"].(string); ok {
			byStudent[sid] = s
		}
	}

	roster := make([]fiber.Map, 0, len(students))
	for _, s := range students {
		sid, _ := s["id"].(string)
		row := fiber.Map{"studentId": sid, "name": s["name"], "rollNo": s["roll_no"], "turnedIn": false}
		if sub, ok := byStudent[sid]; ok {
			submittedAt, _ := sub["submitted_at"].(string)
			row["turnedIn"] = true
			row["submissionId"] = sub["id"]
			row["submittedAt"] = submittedAt
			row["fileName"] = sub["file_name"]
			row["marksAwarded"] = sub["marks_awarded"]
			row["gradedBy"] = sub["graded_by"]
			row["gradedAt"] = sub["graded_at"]
			row["aiSuggestedScore"] = sub["ai_suggested_score"]
			row["aiFeedback"] = sub["ai_feedback"]
			row["aiMistakeTags"] = sub["ai_mistake_tags"]
			row["aiGeneratedBy"] = sub["ai_generated_by"]
			row["late"] = dueDate != "" && submittedAt != "" && submittedAt > dueDate
		}
		roster = append(roster, row)
	}

	return c.JSON(fiber.Map{"success": true, "homework": homework, "roster": roster})
}

// GradeHomeworkSubmission lets a teacher set (or override the AI
// suggestion for) the final marks on one submission.
func (d *Deps) GradeHomeworkSubmission(c *fiber.Ctx) error {
	var body struct {
		SubmissionID string `json:"submissionId"`
		MarksAwarded int    `json:"marksAwarded"`
	}
	if err := c.BodyParser(&body); err != nil || body.SubmissionID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "submissionId is required."})
	}
	db := d.UserDB(c)

	var submission map[string]interface{}
	if err := db.SelectOne("homework_submissions", url.Values{
		"select": {"homework_id"}, "id": {"eq." + body.SubmissionID},
	}, &submission); err != nil || submission == nil {
		return c.JSON(fiber.Map{"success": false, "message": "Submission not found."})
	}
	homeworkID, _ := submission["homework_id"].(string)
	var homework map[string]interface{}
	_ = db.SelectOne("homework", url.Values{"select": {"points"}, "id": {"eq." + homeworkID}}, &homework)
	maxPoints := 0
	if p, ok := homework["points"].(float64); ok {
		maxPoints = int(p)
	}
	if maxPoints > 0 && (body.MarksAwarded < 0 || body.MarksAwarded > maxPoints) {
		return c.JSON(fiber.Map{"success": false, "message": fmt.Sprintf("Marks must be between 0 and %d.", maxPoints)})
	}

	user := middleware.UserFromLocals(c)
	if err := db.Update("homework_submissions", url.Values{"id": {"eq." + body.SubmissionID}}, map[string]interface{}{
		"marks_awarded": body.MarksAwarded, "graded_by": user.Name, "graded_at": time.Now().Format(time.RFC3339),
	}); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "homework.grade", "homework_submissions", body.SubmissionID, fiber.Map{"after": fiber.Map{"marksAwarded": body.MarksAwarded}})
	return c.JSON(fiber.Map{"success": true})
}

// GetSubmissionFile returns just the PDF bytes (base64) + filename for a
// single submission — kept separate from the roster endpoint so a teacher
// only downloads the (possibly several-MB) file for the one student they
// actually click "View PDF" on.
func (d *Deps) GetSubmissionFile(c *fiber.Ctx) error {
	submissionID := c.Query("submissionId")
	if submissionID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "submissionId is required."})
	}
	var submission map[string]interface{}
	if err := d.UserDB(c).SelectOne("homework_submissions", url.Values{
		"select": {"file_name,file_base64"}, "id": {"eq." + submissionID},
	}, &submission); err != nil || submission == nil {
		return c.JSON(fiber.Map{"success": false, "message": "Submission not found."})
	}
	return c.JSON(fiber.Map{"success": true, "fileName": submission["file_name"], "fileBase64": submission["file_base64"]})
}

// GetMyHomeworkSubmission is the student-facing detail view of their own
// submission: when they turned it in, whether AI feedback is ready yet,
// and (once a teacher has graded it) the final marks.
func (d *Deps) GetMyHomeworkSubmission(c *fiber.Ctx) error {
	homeworkID := c.Query("homeworkId")
	if homeworkID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "homeworkId is required."})
	}
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	var submission map[string]interface{}
	err = d.UserDB(c).SelectOne("homework_submissions", url.Values{
		"select":      {"id,submitted_at,file_name,marks_awarded,graded_by,graded_at,ai_suggested_score,ai_feedback,ai_mistakes,ai_strengths,ai_generated_by,ai_evaluated_at"},
		"homework_id": {"eq." + homeworkID}, "student_id": {"eq." + studentID},
	}, &submission)
	if err != nil || submission == nil {
		return c.JSON(fiber.Map{"success": true, "submission": nil})
	}
	return c.JSON(fiber.Map{"success": true, "submission": submission})
}

// GetHomeworkClassInsight is the "how should I teach differently" view: it
// counts how many students' AI evaluations share each mistake tag. A tag
// only 1 student hit is just that student's note; a tag several students
// hit independently is a real class-wide pattern worth revisiting — that's
// the actual signal a teacher can act on, not a single grading opinion.
func (d *Deps) GetHomeworkClassInsight(c *fiber.Ctx) error {
	homeworkID := c.Query("homeworkId")
	if homeworkID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "homeworkId is required."})
	}
	var submissions []map[string]interface{}
	_ = d.UserDB(c).Select("homework_submissions", url.Values{
		"select": {"ai_mistake_tags,ai_mistakes,ai_suggested_score,marks_awarded,ai_generated_by"}, "homework_id": {"eq." + homeworkID},
	}, &submissions)

	type tagInfo struct {
		Count   int
		Example string
	}
	tags := map[string]*tagInfo{}
	evaluated := 0
	var scoreSum, scoreCount, marksSum, marksCount int

	for _, s := range submissions {
		if genBy, _ := s["ai_generated_by"].(string); genBy == "llm" {
			evaluated++
		}
		if score, ok := s["ai_suggested_score"].(float64); ok {
			scoreSum += int(score)
			scoreCount++
		}
		if marks, ok := s["marks_awarded"].(float64); ok {
			marksSum += int(marks)
			marksCount++
		}
		rawTags, _ := s["ai_mistake_tags"].([]interface{})
		rawMistakes, _ := s["ai_mistakes"].([]interface{})
		explanationFor := map[string]string{}
		for _, m := range rawMistakes {
			if mm, ok := m.(map[string]interface{}); ok {
				tag, _ := mm["tag"].(string)
				explanation, _ := mm["explanation"].(string)
				if tag != "" {
					explanationFor[tag] = explanation
				}
			}
		}
		for _, t := range rawTags {
			tag, _ := t.(string)
			if tag == "" {
				continue
			}
			if tags[tag] == nil {
				tags[tag] = &tagInfo{}
			}
			tags[tag].Count++
			if tags[tag].Example == "" {
				tags[tag].Example = explanationFor[tag]
			}
		}
	}

	type tagOut struct {
		Tag     string `json:"tag"`
		Count   int    `json:"count"`
		Example string `json:"example"`
	}
	tagsOut := make([]tagOut, 0, len(tags))
	for tag, info := range tags {
		tagsOut = append(tagsOut, tagOut{Tag: tag, Count: info.Count, Example: info.Example})
	}
	// Simple stable insertion sort, most common mistake first — no
	// external sort package needed for a list this short.
	for i := 1; i < len(tagsOut); i++ {
		for j := i; j > 0 && tagsOut[j].Count > tagsOut[j-1].Count; j-- {
			tagsOut[j], tagsOut[j-1] = tagsOut[j-1], tagsOut[j]
		}
	}

	suggestions := make([]string, 0)
	for _, t := range tagsOut {
		// "Several students" — 2 is already worth a teacher's attention on
		// a homework assignment (unlike a whole-class exam), so the bar is
		// deliberately low rather than requiring a large percentage.
		if t.Count >= 2 {
			suggestions = append(suggestions, fmt.Sprintf("%d students made the same mistake — \"%s\". Consider revisiting this in class.", t.Count, t.Tag))
		}
	}

	avgSuggested := 0
	if scoreCount > 0 {
		avgSuggested = scoreSum / scoreCount
	}
	avgAwarded := 0
	if marksCount > 0 {
		avgAwarded = marksSum / marksCount
	}

	return c.JSON(fiber.Map{
		"success": true, "totalSubmissions": len(submissions), "aiEvaluatedCount": evaluated,
		"mistakeTags": tagsOut, "teachingSuggestions": suggestions,
		"averageSuggestedScore": avgSuggested, "averageMarksAwarded": avgAwarded, "gradedCount": marksCount,
	})
}

// ---------------------------------------------------------------------------
// AI evaluation itself
// ---------------------------------------------------------------------------

type aiMistake struct {
	Tag         string `json:"tag"`
	Explanation string `json:"explanation"`
}

type homeworkGradeResult struct {
	SuggestedScore int         `json:"suggestedScore"`
	Feedback       string      `json:"feedback"`
	Mistakes       []aiMistake `json:"mistakes"`
	Strengths      []string    `json:"strengths"`
}

// evaluateSubmissionInBackground is called as `go evaluateSubmissionInBackground(...)`
// right after a submission is stored — never inline in the request. It uses
// the passed-in service-role client (safe across goroutines/request
// lifecycles) rather than anything tied to the original *fiber.Ctx.
//
// If GEMINI_API_KEY isn't set, or the call fails for any reason, this
// writes ai_generated_by = "unavailable"/"error" rather than fabricating a
// score or feedback — honest silence, same principle as generateSummary's
// rules-fallback, just with no rules-based homework grader to fall back to
// (grading requires actually reading the PDF, which a template can't do).
func evaluateSubmissionInBackground(db *supabase.Client, submissionID, fileBase64, title, subject, description string, maxPoints int) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		_ = db.Update("homework_submissions", url.Values{"id": {"eq." + submissionID}}, map[string]interface{}{
			"ai_generated_by": "unavailable", "ai_evaluated_at": time.Now().Format(time.RFC3339),
		})
		return
	}

	result, err := callGeminiGradeHomework(apiKey, fileBase64, title, subject, description, maxPoints)
	if err != nil {
		_ = db.Update("homework_submissions", url.Values{"id": {"eq." + submissionID}}, map[string]interface{}{
			"ai_generated_by": "error", "ai_evaluated_at": time.Now().Format(time.RFC3339),
		})
		return
	}

	tags := make([]string, 0, len(result.Mistakes))
	for _, m := range result.Mistakes {
		if m.Tag != "" {
			tags = append(tags, m.Tag)
		}
	}
	score := result.SuggestedScore
	if score < 0 {
		score = 0
	}
	if maxPoints > 0 && score > maxPoints {
		score = maxPoints
	}

	_ = db.Update("homework_submissions", url.Values{"id": {"eq." + submissionID}}, map[string]interface{}{
		"ai_suggested_score": score, "ai_feedback": result.Feedback,
		"ai_mistake_tags": tags, "ai_mistakes": result.Mistakes, "ai_strengths": result.Strengths,
		"ai_generated_by": "llm", "ai_evaluated_at": time.Now().Format(time.RFC3339),
	})
}

// callGeminiGradeHomework sends the submitted PDF itself (as inline base64
// data, not extracted/OCR'd text — Gemini reads the PDF's pages directly,
// which also covers scanned/handwritten pages a text-only pipeline
// couldn't) to Gemini alongside the assignment's own rubric, and asks for
// strict JSON back via responseMimeType.
func callGeminiGradeHomework(apiKey, fileBase64, title, subject, description string, maxPoints int) (*homeworkGradeResult, error) {
	instructions := fmt.Sprintf(
		"You are grading a student's homework submission (attached as a PDF) for a school. "+
			"Assignment: %q (subject: %s). Instructions given to the student: %q. Maximum score: %d.\n\n"+
			"Read the submission and reply with ONLY a JSON object (no markdown fences, no commentary) matching exactly this shape:\n"+
			"{\"suggestedScore\": <integer 0-%d>, \"feedback\": \"<2-4 sentences, addressed directly to the student, honest but encouraging>\", "+
			"\"mistakes\": [{\"tag\": \"<3-6 word category, lowercase, e.g. 'sign error in algebra'>\", \"explanation\": \"<one sentence, specific to this submission>\"}], "+
			"\"strengths\": [\"<short phrase>\", ...]}\n\n"+
			"Rules: only note mistakes actually visible in the submission — never invent an error to fill the list. "+
			"If the submission is empty, blank, or unreadable, suggestedScore must be 0 and feedback must say so plainly. "+
			"Keep each mistake tag short and general enough that the same tag would apply if a different student made the identical error "+
			"(a teacher aggregates these tags across the whole class to see what to re-teach).",
		title, subject, description, maxPoints, maxPoints,
	)

	payload, _ := json.Marshal(map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]interface{}{
				{"text": instructions},
				{"inline_data": map[string]string{"mime_type": "application/pdf", "data": fileBase64}},
			}},
		},
		"generationConfig": map[string]interface{}{
			"maxOutputTokens":  700,
			"responseMimeType": "application/json",
		},
	})

	endpoint := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req) // grading a whole PDF is slower than the one-paragraph daily summary
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil || len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("unexpected Gemini response: %s", string(raw))
	}

	var result homeworkGradeResult
	text := strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	if err := json.Unmarshal([]byte(strings.TrimSpace(text)), &result); err != nil {
		return nil, fmt.Errorf("could not parse grading result: %w", err)
	}
	return &result, nil
}
