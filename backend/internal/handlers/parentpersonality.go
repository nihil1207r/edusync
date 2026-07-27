package handlers

import (
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// LogMessageRead records which delivery action a parent actually took on a
// notice or daily summary — expanded to "detailed", used the browser's
// built-in text-to-speech ("voice"), opened a small chart-style breakdown
// ("visual"), or just read the concise default. This is the real signal
// Parent Personality learns from; nothing here is inferred from outside
// this app.
func (d *Deps) LogMessageRead(c *fiber.Ctx) error {
	var body struct {
		MessageType string `json:"messageType"` // notice | daily_summary
		MessageID   string `json:"messageId"`
		Action      string `json:"action"` // concise | detailed | voice | visual
	}
	if err := c.BodyParser(&body); err != nil || body.Action == "" {
		return c.JSON(fiber.Map{"success": false, "message": "action is required."})
	}
	user := middleware.UserFromLocals(c)
	if err := d.UserDB(c).Insert("message_reads", map[string]interface{}{
		"parent_id": user.ID, "message_type": body.MessageType, "message_id": body.MessageID, "action": body.Action,
	}, false, nil); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.recomputeCommPrefs(c, user.ID)
	return c.JSON(fiber.Map{"success": true})
}

const minPrefSample = 5

// recomputeCommPrefs is best-effort — run inline after each log for
// simplicity (message_reads volume per family is tiny, so this isn't a
// performance concern) rather than a background job.
func (d *Deps) recomputeCommPrefs(c *fiber.Ctx, parentID string) {
	db := d.UserDB(c)
	var reads []map[string]interface{}
	_ = db.Select("message_reads", url.Values{"select": {"action"}, "parent_id": {"eq." + parentID}, "order": {"created_at.desc"}, "limit": {"30"}}, &reads)
	if len(reads) < minPrefSample {
		return
	}
	counts := map[string]int{}
	for _, r := range reads {
		if a, ok := r["action"].(string); ok {
			counts[a]++
		}
	}
	best, bestN := "concise", 0
	for action, n := range counts {
		if n > bestN {
			best, bestN = action, n
		}
	}
	confidence := float64(bestN) / float64(len(reads))
	_ = db.Upsert("parent_communication_prefs", []map[string]interface{}{{
		"parent_id": parentID, "preferred_format": best, "learned_confidence": round1(confidence * 100) / 100,
		"sample_size": len(reads),
	}}, "parent_id", false, nil)
}

// GetCommPrefs: a parent gets their own; staff can pass ?parentId= to see a
// family's learned preference (RLS still governs what actually comes back —
// staff can read the pref row, but never the raw message_reads log).
func (d *Deps) GetCommPrefs(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	parentID := c.Query("parentId")
	if parentID == "" {
		parentID = user.ID
	}
	var pref map[string]interface{}
	if err := d.UserDB(c).SelectOne("parent_communication_prefs", url.Values{"select": {"*"}, "parent_id": {"eq." + parentID}}, &pref); err != nil {
		return c.JSON(fiber.Map{
			"success": true, "preferredFormat": "concise", "learnedConfidence": 0, "sampleSize": 0,
			"note": "Not enough read history yet to learn a preference — defaulting to concise.",
		})
	}
	return c.JSON(fiber.Map{
		"success": true, "preferredFormat": pref["preferred_format"], "learnedConfidence": pref["learned_confidence"],
		"sampleSize": pref["sample_size"],
		"note":       "Learned from which delivery format you've actually opened recently, not assumed.",
	})
}
