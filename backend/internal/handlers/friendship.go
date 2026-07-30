package handlers

import (
	"fmt"
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// GenerateFriendshipSuggestions computes simple, disclosed statistics over
// engagement_logs and inserts candidate rows for a teacher to review. This
// is deliberately not a sophisticated peer-graph model — there's no real
// signal in this app for who talks to whom, only each student's own
// participation trend — so the only honest inferences available are:
//   - isolation_risk: a student whose participation is well below their
//     class's average over enough logged sessions to mean something
//   - suggested_seating: pairing that same student with a consistently
//     high-participation classmate, in case peer modeling helps
// Every suggestion lands as status='suggested' — nothing here is applied
// automatically; a teacher must accept or reject it (see RespondToSuggestion).
func (d *Deps) GenerateFriendshipSuggestions(c *fiber.Ctx) error {
	class := c.Query("class")
	if class == "" {
		class = d.classForUser(c)
	}
	db := d.UserDB(c)

	var students []map[string]interface{}
	_ = db.Select("students", url.Values{"select": {"id,name"}, "class": {"eq." + class}}, &students)

	type stat struct {
		id, name string
		avg      float64
		n        int
	}
	stats := make([]stat, 0, len(students))
	for _, s := range students {
		id, _ := s["id"].(string)
		name, _ := s["name"].(string)
		var logs []map[string]interface{}
		_ = db.Select("engagement_logs", url.Values{"select": {"participation"}, "student_id": {"eq." + id}, "limit": {"20"}}, &logs)
		vals := make([]float64, 0, len(logs))
		for _, l := range logs {
			if p, ok := l["participation"].(float64); ok {
				vals = append(vals, p)
			}
		}
		avg, n := meanOf(vals)
		stats = append(stats, stat{id, name, avg, n})
	}

	const minSample = 3
	overallSum, overallN := 0.0, 0
	for _, s := range stats {
		if s.n >= minSample {
			overallSum += s.avg
			overallN++
		}
	}
	if overallN == 0 {
		return c.JSON(fiber.Map{"success": true, "generated": 0, "message": "Not enough logged engagement data yet to generate suggestions."})
	}
	overallAvg := overallSum / float64(overallN)

	var highest stat
	for _, s := range stats {
		if s.n >= minSample && s.avg > highest.avg {
			highest = s
		}
	}

	generated := 0
	for _, s := range stats {
		if s.n < minSample || s.avg >= overallAvg-0.7 {
			continue
		}
		evidence := fmt.Sprintf("Participation averages %.1f/5 over %d logged sessions, vs a class average of %.1f/5.", s.avg, s.n, overallAvg)
		_ = db.Insert("peer_relationships", map[string]interface{}{
			"student_a_id": s.id, "relationship_type": "isolation_risk",
			"confidence_score": confidenceFromSample(s.n), "evidence_source": evidence,
		}, false, nil)
		generated++

		if highest.id != "" && highest.id != s.id {
			_ = db.Insert("peer_relationships", map[string]interface{}{
				"student_a_id": s.id, "student_b_id": highest.id, "relationship_type": "suggested_seating",
				"confidence_score": confidenceFromSample(minInt(s.n, highest.n)),
				"evidence_source":  fmt.Sprintf("%s has the class's highest logged participation (%.1f/5 over %d sessions) — worth trying as a seating pair.", highest.name, highest.avg, highest.n),
			}, false, nil)
			generated++
		}
	}

	return c.JSON(fiber.Map{"success": true, "generated": generated})
}

func confidenceFromSample(n int) float64 {
	// Capped, simple mapping — more logged sessions = more confidence, but
	// never above 0.85 since this is still a heuristic, not a validated model.
	c := 0.3 + float64(n)*0.05
	if c > 0.85 {
		c = 0.85
	}
	return c
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (d *Deps) ListPeerRelationships(c *fiber.Ctx) error {
	class := c.Query("class")
	status := c.Query("status")
	q := url.Values{"select": {"*,a:student_a_id(name),b:student_b_id(name)"}, "order": {"created_at.desc"}}
	if status != "" {
		q.Set("status", "eq."+status)
	}
	var rows []map[string]interface{}
	if err := d.UserDB(c).Select("peer_relationships", q, &rows); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	_ = class // class filtering would need a join; left for a future pass — see NOTES.md
	return c.JSON(fiber.Map{"success": true, "relationships": orEmpty(rows)})
}

func (d *Deps) RespondToPeerSuggestion(c *fiber.Ctx) error {
	var body struct {
		ID     string `json:"id"`
		Status string `json:"status"` // accepted | rejected
	}
	if err := c.BodyParser(&body); err != nil || body.ID == "" || (body.Status != "accepted" && body.Status != "rejected") {
		return c.JSON(fiber.Map{"success": false, "message": "id and status (accepted/rejected) are required."})
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Update("peer_relationships", url.Values{"id": {"eq." + body.ID}}, map[string]interface{}{
		"status": body.Status, "reviewed_by": user.Name, "reviewed_at": "now",
	})
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// AddTeacherPeerObservation lets a teacher directly assert a relationship
// (e.g. "X explains well to Y") rather than the system inferring one. Since
// the teacher stated it directly, it's inserted pre-accepted.
func (d *Deps) AddTeacherPeerObservation(c *fiber.Ctx) error {
	var body struct {
		StudentAID       string `json:"studentAId"`
		StudentBID       string `json:"studentBId"`
		RelationshipType string `json:"relationshipType"`
		Notes            string `json:"notes"`
	}
	if err := c.BodyParser(&body); err != nil || body.StudentAID == "" || body.RelationshipType == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentAId and relationshipType are required."})
	}
	row := map[string]interface{}{
		"student_a_id": body.StudentAID, "relationship_type": body.RelationshipType,
		"evidence_source": "teacher-reported" + condString(body.Notes != "", ": "+body.Notes, ""),
		"status":          "accepted",
	}
	if body.StudentBID != "" {
		row["student_b_id"] = body.StudentBID
	}
	user := middleware.UserFromLocals(c)
	row["reviewed_by"] = user.Name
	if err := d.UserDB(c).Insert("peer_relationships", row, false, nil); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func condString(cond bool, ifTrue, ifFalse string) string {
	if cond {
		return ifTrue
	}
	return ifFalse
}
