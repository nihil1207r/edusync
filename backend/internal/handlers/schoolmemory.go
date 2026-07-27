package handlers

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

func (d *Deps) CreateSchoolEvent(c *fiber.Ctx) error {
	var body struct {
		StudentID   string `json:"studentId"`
		EventType   string `json:"eventType"`
		Description string `json:"description"`
		EventDate   string `json:"eventDate"`
	}
	if err := c.BodyParser(&body); err != nil || body.StudentID == "" || body.Description == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId and description are required."})
	}
	if body.EventType == "" {
		body.EventType = "other"
	}
	user := middleware.UserFromLocals(c)
	row := map[string]interface{}{
		"student_id": body.StudentID, "event_type": body.EventType, "description": body.Description,
		"logged_by": user.Name,
	}
	if body.EventDate != "" {
		row["event_date"] = body.EventDate
	}
	if err := d.UserDB(c).Insert("school_events_index", row, false, nil); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// SearchSchoolMemory answers things like "who's participated in robotics
// since Class 6" by turning the query into keyword + optional event_type
// filters and running a real, parameterized query against
// school_events_index — never letting free text reach SQL directly. The
// rule-based parser (keyword extraction) needs no credentials; with
// GEMINI_API_KEY set, a two-pass Gemini extraction (draft, then a second
// pass that checks the draft against the original query) extracts the
// same {keywords, eventType} shape instead, which is then applied through
// the identical safe query path below — the LLM only helps interpret the
// question, it never generates the answer itself.
func (d *Deps) SearchSchoolMemory(c *fiber.Ctx) error {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		return c.JSON(fiber.Map{"success": false, "message": "q is required."})
	}

	keywords, eventType := parseSchoolMemoryQuery(query)
	if len(keywords) == 0 {
		return c.JSON(fiber.Map{"success": true, "results": []map[string]interface{}{}, "note": "Couldn't extract a usable search term from that query."})
	}

	db := d.UserDB(c)
	q := url.Values{
		"select": {"*,students(name,class)"},
		"or":     {"(" + orIlike("description", keywords) + ")"},
		"order":  {"event_date.desc"}, "limit": {"50"},
	}
	if eventType != "" {
		q.Set("event_type", "eq."+eventType)
	}
	var rows []map[string]interface{}
	_ = db.Select("school_events_index", q, &rows)

	return c.JSON(fiber.Map{"success": true, "results": orEmpty(rows), "interpretedKeywords": keywords, "interpretedEventType": eventType})
}

func orIlike(column string, keywords []string) string {
	parts := make([]string, 0, len(keywords))
	for _, k := range keywords {
		parts = append(parts, column+".ilike.*"+k+"*")
	}
	return strings.Join(parts, ",")
}

var stopwords = map[string]bool{
	"who": true, "has": true, "have": true, "since": true, "in": true, "on": true, "the": true,
	"a": true, "an": true, "of": true, "class": true, "is": true, "are": true,
	"participated": true, "participate": true, "with": true, "and": true, "for": true, "to": true,
}

func parseSchoolMemoryQuery(query string) ([]string, string) {
	if key := os.Getenv("GEMINI_API_KEY"); key != "" {
		if kws, et, err := parseQueryViaLLM(key, query); err == nil && len(kws) > 0 {
			return kws, et
		}
	}
	words := strings.Fields(strings.ToLower(strings.Trim(query, "?.!")))
	keywords := make([]string, 0, len(words))
	for _, w := range words {
		w = strings.Trim(w, ",")
		if w == "" || stopwords[w] {
			continue
		}
		keywords = append(keywords, w)
	}
	return keywords, ""
}

// parseQueryViaLLM: same two-pass "draft, then self-review" pattern as
// generateSummaryViaLLM in insight.go — see that function's comment for
// why this is one model checking its own work rather than two models
// debating (Grok has no reliable free tier; see NOTES.md).
func parseQueryViaLLM(apiKey, query string) ([]string, string, error) {
	draftPrompt := "Extract search keywords and an optional event type from this school-records search query. " +
		"Respond with ONLY a JSON object like {\"keywords\":[\"robotics\"],\"eventType\":\"extracurricular\"} — " +
		"eventType must be one of exam, certificate, extracurricular, achievement, other, or empty string if unclear. Query: " + query

	draft, err := callGemini(apiKey, draftPrompt, 150)
	if err != nil {
		return nil, "", err
	}

	reviewPrompt := fmt.Sprintf(
		"Review this keyword-extraction result for the search query %q: %s. "+
			"If the keywords miss the query's actual subject, or the JSON is malformed, fix it. Otherwise return it unchanged. "+
			"Reply with ONLY the corrected JSON object, same shape as the input, no other text.",
		query, draft,
	)
	final, err := callGemini(apiKey, reviewPrompt, 150)
	if err != nil || strings.TrimSpace(final) == "" {
		final = draft // review pass failing isn't fatal — fall back to the draft
	}

	var parsed struct {
		Keywords  []string `json:"keywords"`
		EventType string   `json:"eventType"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(final)), &parsed); err != nil {
		// The review pass may have broken valid JSON — fall back to the draft.
		if err2 := json.Unmarshal([]byte(strings.TrimSpace(draft)), &parsed); err2 != nil {
			return nil, "", err
		}
	}
	return parsed.Keywords, parsed.EventType, nil
}
