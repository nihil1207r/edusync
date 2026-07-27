package handlers

import (
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// Audit records a sensitive action (fee change, grade override, role
// change, data export, ...) to the audit_logs table, with the acting
// user, what they did, and a before/after diff where one makes sense.
//
// Written using the actor's own scoped client (not the service role) so
// the audit_logs RLS policy — actor_id = auth.uid() — is what actually
// guarantees the actor_id wasn't spoofed, not just application code
// setting the field correctly.
//
// Errors are logged-and-swallowed rather than failing the request: a
// failed audit write shouldn't block the underlying action, but it's
// worth knowing about, so callers get a bool back if they want to react.
func (d *Deps) Audit(c *fiber.Ctx, action, targetTable, targetID string, diff fiber.Map) bool {
	user := middleware.UserFromLocals(c)
	if user == nil {
		return false
	}
	row := map[string]interface{}{
		"actor_id":     user.ID,
		"actor_name":   user.Name,
		"actor_role":   user.Role,
		"action":       action,
		"target_table": targetTable,
		"target_id":    targetID,
		"diff":         diff,
	}
	err := d.UserDB(c).Insert("audit_logs", row, false, nil)
	return err == nil
}

// AdminAuditLog lets an admin read back the audit trail (RLS restricts
// this to admins regardless, but the route is gated too for a clean 403).
func (d *Deps) AdminAuditLog(c *fiber.Ctx) error {
	var logs []map[string]interface{}
	_ = d.UserDB(c).Select("audit_logs", url.Values{
		"select": {"*"}, "order": {"created_at.desc"}, "limit": {"200"},
	}, &logs)
	return c.JSON(fiber.Map{"success": true, "logs": orEmpty(logs)})
}
