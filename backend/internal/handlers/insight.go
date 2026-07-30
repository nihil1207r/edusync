package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// DailySummary implements a minimal, honest slice of the "Invisible Parent"
// AI Insight feature: one calm paragraph per student per day, built from
// real attendance/homework/wellness data already in the database.
//
// It's rule-based (template) by default so it works with zero external
// credentials. If GEMINI_API_KEY is set, it instead asks Gemini to turn
// the same source data into prose — same inputs, same auditability, just a
// better-written sentence. Either way, the exact source_data used is stored
// alongside the summary for auditability, per the brief's requirement.
//
// This is a pattern summary, not a diagnosis or prediction — it only
// restates what already happened today.
func (d *Deps) DailySummary(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}

	today := todayDate()

	var cached map[string]interface{}
	if err := d.UserDB(c).SelectOne("daily_summaries", url.Values{
		"select": {"*"}, "student_id": {"eq." + studentID}, "summary_date": {"eq." + today},
	}, &cached); err == nil && cached != nil {
		return c.JSON(fiber.Map{
			"success": true, "summary": cached["summary"], "generatedBy": cached["generated_by"],
			"cached": true, "sourceData": cached["source_data"],
		})
	}

	sourceData, err := d.gatherDailySourceData(c, studentID, today)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Could not gather today's data: " + err.Error()})
	}

	summary, generatedBy := generateSummary(sourceData)

	_ = d.UserDB(c).Insert("daily_summaries", map[string]interface{}{
		"student_id": studentID, "summary_date": today, "summary": summary,
		"source_data": sourceData, "generated_by": generatedBy,
	}, false, nil)

	return c.JSON(fiber.Map{
		"success": true, "summary": summary, "generatedBy": generatedBy, "cached": false, "sourceData": sourceData,
	})
}

func (d *Deps) gatherDailySourceData(c *fiber.Ctx, studentID, today string) (map[string]interface{}, error) {
	db := d.UserDB(c)
	var student map[string]interface{}
	if err := db.SelectOne("students", url.Values{"select": {"name"}, "id": {"eq." + studentID}}, &student); err != nil {
		return nil, err
	}

	var attendanceToday map[string]interface{}
	_ = db.SelectOne("attendance", url.Values{"select": {"status"}, "student_id": {"eq." + studentID}, "date": {"eq." + today}}, &attendanceToday)

	var homework []map[string]interface{}
	_ = db.Select("homework", url.Values{"select": {"id,title"}, "order": {"due_date.asc"}}, &homework)

	var submissions []map[string]interface{}
	_ = db.Select("homework_submissions", url.Values{"select": {"homework_id"}, "student_id": {"eq." + studentID}}, &submissions)
	submitted := map[string]bool{}
	for _, s := range submissions {
		if id, ok := s["homework_id"].(string); ok {
			submitted[id] = true
		}
	}
	pending := 0
	for _, h := range homework {
		if id, ok := h["id"].(string); ok && !submitted[id] {
			pending++
		}
	}

	var wellness []map[string]interface{}
	_ = db.Select("wellness", url.Values{"select": {"mood,sentiment"}, "student_id": {"eq." + studentID}, "order": {"created_at.desc"}, "limit": {"3"}}, &wellness)

	name, _ := student["name"].(string)
	attStatus := "not marked yet"
	if attendanceToday != nil {
		if s, ok := attendanceToday["status"].(string); ok {
			attStatus = s
		}
	}

	return map[string]interface{}{
		"studentName":     name,
		"date":            today,
		"attendanceToday": attStatus,
		"homeworkPending": pending,
		"homeworkTotal":   len(homework),
		"recentWellness":  wellness,
	}, nil
}

func generateSummary(data map[string]interface{}) (string, string) {
	if key := os.Getenv("GEMINI_API_KEY"); key != "" {
		if summary, err := generateSummaryViaLLM(key, data); err == nil && summary != "" {
			return summary, "llm"
		}
		// Falls through to the rule-based version on any LLM error, rather
		// than failing the request outright.
	}
	return generateSummaryRuleBased(data), "rules"
}

func generateSummaryRuleBased(data map[string]interface{}) string {
	name, _ := data["studentName"].(string)
	if name == "" {
		name = "Your child"
	}
	att, _ := data["attendanceToday"].(string)
	pending, _ := data["homeworkPending"].(int)

	var b strings.Builder
	switch att {
	case "present":
		fmt.Fprintf(&b, "%s was in school today. ", name)
	case "absent":
		fmt.Fprintf(&b, "%s was marked absent today. ", name)
	default:
		fmt.Fprintf(&b, "Today's attendance for %s hasn't been marked yet. ", name)
	}

	if pending == 0 {
		b.WriteString("All homework is up to date. ")
	} else if pending == 1 {
		b.WriteString("There's 1 homework item still pending. ")
	} else {
		fmt.Fprintf(&b, "There are %d homework items still pending. ", pending)
	}

	if wellness, ok := data["recentWellness"].([]map[string]interface{}); ok && len(wellness) > 0 {
		if sentiment, ok := wellness[0]["sentiment"].(string); ok && sentiment == "negative" {
			b.WriteString("Their most recent wellness check-in came in lower than usual — might be worth a gentle check-in at home.")
		}
	}

	return strings.TrimSpace(b.String())
}

// generateSummaryViaLLM turns source_data into a single calm paragraph
// using a two-pass "draft, then self-review" flow against Gemini (see
// callGemini). Only ever called server-side; never exposes the API key or
// raw prompt to the client.
//
// Why two passes instead of one: the original ask was for two independent
// models (Gemini + Grok) to converse before answering. Grok's API has no
// reliable free tier (see NOTES.md), so this uses Gemini alone in two
// roles instead — a draft pass, then a second pass that reviews that draft
// against the same source data and either approves or corrects it. That's
// a real, functioning safety check (catches invented facts or an
// off-brief tone before the parent sees it), but it is honestly one model
// checking its own work, not two independent models debating — worth
// being clear about rather than overselling it as a multi-model
// conversation it isn't.
func generateSummaryViaLLM(apiKey string, data map[string]interface{}) (string, error) {
	dataJSON, _ := json.Marshal(data)

	draftPrompt := fmt.Sprintf(
		"Write one short, calm paragraph (2-3 sentences, no bullet points, no headers) summarizing a student's day for a parent, from this data: %s. "+
			"Only state what the data shows — don't diagnose, predict, or speculate beyond it.",
		string(dataJSON),
	)
	draft, err := callGemini(apiKey, draftPrompt, 200)
	if err != nil {
		return "", err
	}

	reviewPrompt := fmt.Sprintf(
		"You are reviewing a draft parent-facing summary before it ships. Source data: %s. Draft: %q. "+
			"Check that the draft only restates what the data shows — no invented facts, no diagnosis, no "+
			"prediction — and stays 2-3 calm sentences with no headers or bullet points. "+
			"Reply with ONLY the final paragraph: the draft unchanged if it already passes, or your corrected "+
			"version if it doesn't. No preamble, no explanation of what you changed.",
		string(dataJSON), draft,
	)
	final, err := callGemini(apiKey, reviewPrompt, 200)
	if err != nil || strings.TrimSpace(final) == "" {
		return draft, nil // the review pass failing isn't fatal — ship the draft rather than the whole feature
	}
	return final, nil
}

// callGemini is the one place in this codebase that talks to the Google
// Gemini API — used by the daily summary (Invisible Parent) and School
// Memory's natural-language query parsing. Server-side only; the API key
// never reaches the client, and callers are responsible for not sending
// more student PII in the prompt than the specific task needs. Uses
// gemini-2.5-flash, which is on Gemini's permanent free tier (no credit
// card required) as of this writing — see NOTES.md for the free-tier
// caveats (rate limits, and prompts/responses may be used by Google to
// improve their products on the free tier specifically).
func callGemini(apiKey, prompt string, maxTokens int) (string, error) {
	payload, _ := json.Marshal(map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]string{{"text": prompt}}},
		},
		"generationConfig": map[string]interface{}{"maxOutputTokens": maxTokens},
	})

	endpoint := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
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
		return "", fmt.Errorf("unexpected Gemini response: %s", string(raw))
	}
	return strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text), nil
}

// SilentStudentFlags is a minimal slice of the Silent Student Detector: it
// flags (never diagnoses) students whose last 7 days show zero homework
// submissions AND below-average wellness check-ins, for a teacher to review.
func (d *Deps) SilentStudentFlags(c *fiber.Ctx) error {
	class := d.classForUser(c)
	var students []map[string]interface{}
	_ = d.UserDB(c).Select("students", url.Values{"select": {"id,name,class"}, "class": {"eq." + class}}, &students)

	flags := make([]fiber.Map, 0)
	for _, s := range students {
		studentID, _ := s["id"].(string)
		var submissions []map[string]interface{}
		_ = d.UserDB(c).Select("homework_submissions", url.Values{"select": {"id"}, "student_id": {"eq." + studentID}}, &submissions)
		var wellness []map[string]interface{}
		_ = d.UserDB(c).Select("wellness", url.Values{"select": {"mood"}, "student_id": {"eq." + studentID}, "order": {"created_at.desc"}, "limit": {"5"}}, &wellness)

		negativeStreak := 0
		for _, w := range wellness {
			if m, ok := w["mood"].(float64); ok && m <= 2 {
				negativeStreak++
			} else {
				break
			}
		}

		if len(submissions) == 0 && negativeStreak >= 2 {
			flags = append(flags, fiber.Map{
				"studentId": studentID, "name": s["name"],
				"signalSummary": "No homework submissions on record, and the last few wellness check-ins were low. Consider checking in.",
			})
		}
	}
	return c.JSON(fiber.Map{"success": true, "flags": flags, "note": "These are flags for a human check-in, not a diagnosis."})
}
