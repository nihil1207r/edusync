package handlers

import (
	"encoding/json"
	"net/url"
	"time"

	"edunexus/backend/internal/middleware"
	"edunexus/backend/internal/supabase"
	"github.com/gofiber/fiber/v2"
)

// adminStatsCacheTTL is short on purpose: long enough to absorb repeated
// dashboard loads/tab-switches within the same few seconds, short enough
// that any admin action (e.g. linking a child) is never stale for more
// than a moment even where we don't explicitly invalidate (see LinkChild).
const adminStatsCacheTTL = 15 * time.Second

func (d *Deps) AdminStats(c *fiber.Ctx) error {
	// Keyed per-admin (not global) because UserDB scopes every query to the
	// caller via RLS — caching a global key would risk serving one admin's
	// scoped read to another admin in a future multi-tenant/multi-school
	// setup. At today's single-school scale this is equivalent to a global
	// cache in practice, but keying it this way costs nothing and removes
	// the failure mode entirely if that assumption ever changes.
	cacheKey := "adminstats"
	if user := middleware.UserFromLocals(c); user != nil {
		cacheKey = "adminstats:" + user.ID
	}
	if d.Cache != nil {
		if cached, ok := d.Cache.Get(cacheKey); ok {
			c.Set("X-Cache", "HIT")
			return c.Type("json").Send(cached)
		}
	}

	var users []map[string]interface{}
	var students []map[string]interface{}
	var wellness []map[string]interface{}
	var homework []map[string]interface{}

	_ = d.UserDB(c).Select("profiles", url.Values{"select": {"*"}}, &users)
	// Note: previously embedded grades(*),attendance(*) here, which grows
	// unbounded with every student's full history on every dashboard load.
	// Neither is used by the admin dashboard (checked: not read anywhere in
	// admin/page.tsx) — the roster itself is the only thing needed here.
	_ = d.UserDB(c).Select("students", url.Values{"select": {"*"}}, &students)
	_ = d.UserDB(c).Select("wellness", url.Values{"select": {"*"}, "order": {"created_at.desc"}, "limit": {"20"}}, &wellness)
	_ = d.UserDB(c).Select("homework", url.Values{"select": {homeworkSummaryColumns + ",homework_submissions(count)"}}, &homework)

	wellness = orEmpty(wellness)
	avgMood := "0"
	if len(wellness) > 0 {
		sum := 0.0
		for _, w := range wellness {
			if m, ok := w["mood"].(float64); ok {
				sum += m
			}
		}
		avgMood = trimFloat(sum / float64(len(wellness)))
	}

	body := fiber.Map{
		"success": true, "users": orEmpty(users), "students": orEmpty(students),
		"wellness": wellness, "homework": orEmpty(homework), "avgMood": avgMood,
	}

	if d.Cache != nil {
		if data, err := json.Marshal(body); err == nil {
			d.Cache.Set(cacheKey, data, adminStatsCacheTTL)
		}
	}
	c.Set("X-Cache", "MISS")
	return c.JSON(body)
}

// LinkChild links a parent (or student) login to a student record by
// setting profiles.child_id, which is how ParentDashboard/StudentDashboard
// know which student row to read. Admin-only.
func (d *Deps) LinkChild(c *fiber.Ctx) error {
	var body struct {
		ParentID  string `json:"parentId"`
		StudentID string `json:"studentId"`
	}
	if err := c.BodyParser(&body); err != nil || body.ParentID == "" || body.StudentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "parentId and studentId are required."})
	}

	// Confirm the parent profile exists and is actually a parent (or
	// student — students link to their own record the same way) before
	// writing, so a bad ID doesn't silently no-op. Reads use the caller's
	// scoped client (admin has a "reads all" policy); the write below uses
	// the service-role client because `profiles` has no RLS UPDATE policy
	// for any role, same pattern seed.go uses for this same column.
	var profile profileRow
	if err := d.UserDB(c).SelectOne("profiles", url.Values{"select": {"*"}, "id": {supabase.Eq(body.ParentID)}}, &profile); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "User not found."})
	}
	if profile.Role != "parent" && profile.Role != "student" {
		return c.JSON(fiber.Map{"success": false, "message": "Only parent or student logins can be linked to a child record."})
	}

	var student map[string]interface{}
	if err := d.UserDB(c).SelectOne("students", url.Values{"select": {"id"}, "id": {supabase.Eq(body.StudentID)}}, &student); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Student not found."})
	}

	if err := d.DB.Update("profiles", url.Values{"id": {supabase.Eq(body.ParentID)}}, map[string]interface{}{"child_id": body.StudentID}); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Could not link child."})
	}

	d.Audit(c, "profile.link_child", "profiles", body.ParentID, fiber.Map{"child_id": body.StudentID})
	if d.Cache != nil {
		if user := middleware.UserFromLocals(c); user != nil {
			d.Cache.Invalidate("adminstats:" + user.ID)
		}
	}
	return c.JSON(fiber.Map{"success": true})
}

// UnlinkChild clears profiles.child_id for a parent/student login.
func (d *Deps) UnlinkChild(c *fiber.Ctx) error {
	var body struct {
		ParentID string `json:"parentId"`
	}
	if err := c.BodyParser(&body); err != nil || body.ParentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "parentId is required."})
	}
	if err := d.DB.Update("profiles", url.Values{"id": {supabase.Eq(body.ParentID)}}, map[string]interface{}{"child_id": nil}); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Could not unlink child."})
	}
	d.Audit(c, "profile.unlink_child", "profiles", body.ParentID, fiber.Map{"child_id": nil})
	if d.Cache != nil {
		if user := middleware.UserFromLocals(c); user != nil {
			d.Cache.Invalidate("adminstats:" + user.ID)
		}
	}
	return c.JSON(fiber.Map{"success": true})
}
