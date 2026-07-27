package handlers

import (
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// ---- Document repository -------------------------------------------------
// Metadata only — see migrations/005 and NOTES.md. `fileUrl` must point at
// wherever the file actually lives; this pass does not accept raw file
// uploads (no storage bucket credentials in this environment).

func (d *Deps) ListDocuments(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	q := url.Values{"select": {"*"}, "order": {"created_at.desc"}}
	if user.Role == "student" || user.Role == "parent" {
		studentID, err := d.resolveStudentIDForUser(c)
		if err != nil || studentID == "" {
			return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
		}
		// RLS still enforces this; the explicit filter here is just so the
		// same query also returns class-wide/school-wide rows a plain
		// "student_id=eq." filter alone would exclude.
		q.Set("student_id", "eq."+studentID)
	} else if class := c.Query("class"); class != "" {
		q.Set("class", "eq."+class)
	}
	var docs []map[string]interface{}
	if err := d.UserDB(c).Select("documents", q, &docs); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	// For family users, also fetch class-wide/school-wide docs (student_id
	// is null) since the filter above scoped to their own child only.
	if user.Role == "student" || user.Role == "parent" {
		var shared []map[string]interface{}
		_ = d.UserDB(c).Select("documents", url.Values{"select": {"*"}, "student_id": {"is.null"}, "order": {"created_at.desc"}}, &shared)
		docs = append(docs, shared...)
	}
	return c.JSON(fiber.Map{"success": true, "documents": orEmpty(docs)})
}

func (d *Deps) CreateDocument(c *fiber.Ctx) error {
	var body struct {
		StudentID string `json:"studentId"` // optional — empty means class/school-wide
		Class     string `json:"class"`     // optional — empty + no studentId = school-wide
		Title     string `json:"title"`
		Category  string `json:"category"`
		FileURL   string `json:"fileUrl"`
	}
	if err := c.BodyParser(&body); err != nil || body.Title == "" || body.FileURL == "" {
		return c.JSON(fiber.Map{"success": false, "message": "title and fileUrl are required."})
	}
	if body.Category == "" {
		body.Category = "other"
	}
	user := middleware.UserFromLocals(c)
	row := map[string]interface{}{
		"title": body.Title, "category": body.Category, "file_url": body.FileURL,
		"uploaded_by": user.Name,
	}
	if body.StudentID != "" {
		row["student_id"] = body.StudentID
	}
	if body.Class != "" {
		row["class"] = body.Class
	}
	var created []map[string]interface{}
	if err := d.UserDB(c).Insert("documents", row, true, &created); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "document.create", "documents", "", fiber.Map{"after": body})

	// Best-effort School Memory auto-index (Phase 3), only for certificates
	// tied to a specific student — class/school-wide documents (circulars
	// etc.) aren't a per-student "event."
	if body.Category == "certificate" && body.StudentID != "" {
		_ = d.UserDB(c).Insert("school_events_index", map[string]interface{}{
			"student_id": body.StudentID, "event_type": "certificate",
			"description": "Received certificate: " + body.Title, "source_table": "documents",
		}, false, nil)
	}

	return c.JSON(fiber.Map{"success": true, "document": firstOrNil(created)})
}
