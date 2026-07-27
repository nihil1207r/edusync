package handlers

import (
	"net/url"
	"time"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// Mastery implements a minimal "Knowledge Journey": converts each subject's
// raw marks into a mastery percentage, so the student-facing framing is
// "how much of this do you know" rather than a bare score out of 100.
// Marks/grades still exist underneath (the /api/student/dashboard grades
// list is unchanged) — this is an additional lens on the same data, not a
// replacement record.
func (d *Deps) Mastery(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}

	var grades []map[string]interface{}
	_ = d.UserDB(c).Select("grades", url.Values{"select": {"*"}, "student_id": {"eq." + studentID}}, &grades)

	topics := make([]fiber.Map, 0, len(grades))
	for _, g := range grades {
		marks, _ := g["marks"].(float64)
		total, _ := g["total"].(float64)
		pct := 0.0
		if total > 0 {
			pct = (marks / total) * 100
		}
		topics = append(topics, fiber.Map{
			"subject":    g["subject"],
			"masteryPct": int(pct + 0.5),
		})
	}

	return c.JSON(fiber.Map{"success": true, "topics": topics})
}

// Inbox implements "One Inbox": merges homework, notices, and gate-pass
// status into a single feed sorted by time, in place of separate pages. It
// reads straight from existing tables rather than a separate synced copy.
func (d *Deps) Inbox(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)

	items := make([]fiber.Map, 0)

	var notices []map[string]interface{}
	_ = d.UserDB(c).Select("announcements", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"20"}}, &notices)
	for _, n := range notices {
		items = append(items, fiber.Map{
			"type": "notice", "id": n["id"], "title": n["title"], "body": n["message"],
			"createdAt": n["created_at"], "important": n["important"],
		})
	}

	var homework []map[string]interface{}
	_ = d.UserDB(c).Select("homework", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"20"}}, &homework)
	for _, h := range homework {
		items = append(items, fiber.Map{
			"type": "homework", "id": h["id"], "title": h["title"], "body": h["subject"],
			"createdAt": h["created_at"], "dueDate": h["due_date"],
		})
	}

	if user.Role == "student" || user.Role == "parent" {
		studentID, _ := d.resolveStudentIDForUser(c)
		if studentID != "" {
			var passes []map[string]interface{}
			_ = d.UserDB(c).Select("gatepasses", url.Values{"select": {"*"}, "student_id": {"eq." + studentID}, "order": {"created_at.desc"}, "limit": {"10"}}, &passes)
			for _, p := range passes {
				items = append(items, fiber.Map{
					"type": "gatepass", "id": p["id"], "title": "Gate pass: " + toStr(p["status"]),
					"body": p["reason"], "createdAt": p["created_at"],
				})
			}
			var leaves []map[string]interface{}
			_ = d.UserDB(c).Select("leave_requests", url.Values{"select": {"*"}, "student_id": {"eq." + studentID}, "order": {"created_at.desc"}, "limit": {"10"}}, &leaves)
			for _, l := range leaves {
				items = append(items, fiber.Map{
					"type": "leave", "id": l["id"], "title": "Leave request: " + toStr(l["status"]),
					"body": l["reason"], "createdAt": l["created_at"],
				})
			}
		}
	}

	sortByCreatedAtDesc(items)
	return c.JSON(fiber.Map{"success": true, "items": items})
}

func sortByCreatedAtDesc(items []fiber.Map) {
	// Small enough lists (≤60 items) that a simple insertion-style sort via
	// the standard library is plenty; avoids pulling in a generics helper
	// for one call site.
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && itemTime(items[j]) > itemTime(items[j-1]); j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
	}
}

func itemTime(item fiber.Map) string {
	s, _ := item["createdAt"].(string)
	if s == "" {
		return time.Time{}.Format(time.RFC3339)
	}
	return s
}
