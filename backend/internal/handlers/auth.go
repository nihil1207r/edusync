package handlers

import (
	"net/url"
	"time"

	"edunexus/backend/internal/cache"
	"edunexus/backend/internal/middleware"
	"edunexus/backend/internal/supabase"
	"github.com/gofiber/fiber/v2"
)

type Deps struct {
	DB     *supabase.Client // service-role client — bypasses RLS, use sparingly (see UserDB)
	Secret string
	// IsProduction disables dev-only endpoints (see router.go: /admin/seed,
	// /debug/profile) outright, rather than relying only on auth/rate
	// limiting to keep them safe.
	IsProduction bool
	// Cache is a small in-memory TTL cache for a handful of read-heavy
	// endpoints (currently just AdminStats). See internal/cache for the
	// honest tradeoffs of an in-process cache. Nil-safe: if unset, callers
	// fall back to always querying fresh (see AdminStats).
	Cache *cache.Cache
}

// UserDB returns a Supabase client scoped to the currently-authenticated
// request's user, so all queries it makes are subject to RLS as that user.
// This is the client every handler should use for normal reads/writes.
// If the request has no user session (shouldn't happen behind RequireAuth,
// but defensively), it falls back to the service-role client.
//
// It also transparently refreshes the Supabase access token if it's
// expired, using the refresh token, and reissues the session cookie with
// the new tokens so the user doesn't get logged out every ~1h.
func (d *Deps) UserDB(c *fiber.Ctx) *supabase.Client {
	user := middleware.UserFromLocals(c)
	if user == nil || user.SupabaseAccessToken == "" {
		return d.DB
	}
	if user.NeedsRefresh() && user.SupabaseRefreshToken != "" {
		if sess, err := d.DB.RefreshSession(user.SupabaseRefreshToken); err == nil {
			user.SupabaseAccessToken = sess.AccessToken
			user.SupabaseRefreshToken = sess.RefreshToken
			user.SupabaseExpiresAt = time.Now().Add(time.Duration(sess.ExpiresIn) * time.Second).Unix()
			_ = middleware.IssueSession(c, d.Secret, *user)
			c.Locals("user", user)
		}
		// If refresh fails, fall through and let PostgREST reject the stale
		// token with 401 — better than silently using the service role.
	}
	return d.DB.WithUserToken(user.SupabaseAccessToken)
}

type profileRow struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	Class       string `json:"class"`
	ChildID     string `json:"child_id"`
	MFAEnrolled bool   `json:"mfa_enrolled"`
}

func (d *Deps) Login(c *fiber.Ctx) error {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}

	session, err := d.DB.SignInWithPassword(body.Email, body.Password)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid email or password."})
	}

	// Look up the profile as the user themselves (their own RLS policy
	// must allow reading their own profile row) rather than via the
	// service-role key — this is the first real RLS-enforced query.
	asUser := d.DB.WithUserToken(session.AccessToken)
	var profile profileRow
	q := url.Values{"select": {"*"}, "id": {supabase.Eq(session.User.ID)}}
	if err := asUser.SelectOne("profiles", q, &profile); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Profile not found. Contact admin."})
	}

	sessionUser := middleware.SessionUser{
		ID:                   session.User.ID,
		Name:                 profile.Name,
		Email:                session.User.Email,
		Role:                 profile.Role,
		Class:                profile.Class,
		ChildID:              profile.ChildID,
		SupabaseAccessToken:  session.AccessToken,
		SupabaseRefreshToken: session.RefreshToken,
		SupabaseExpiresAt:    time.Now().Add(time.Duration(session.ExpiresIn) * time.Second).Unix(),
		MFAVerified:          !middleware.RoleRequiresMFA(profile.Role), // parent/student/driver: n/a, treated as satisfied
	}
	if err := middleware.IssueSession(c, d.Secret, sessionUser); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Server error."})
	}

	if middleware.RoleRequiresMFA(profile.Role) {
		if !profile.MFAEnrolled {
			// First login as admin/teacher: must set up TOTP before doing
			// anything else. The session cookie above is already set
			// (MFAVerified: false) so /auth/mfa/enroll can use it.
			return c.JSON(fiber.Map{"success": true, "role": profile.Role, "name": profile.Name, "mfaSetupRequired": true})
		}
		// Already enrolled: start a fresh challenge for the client to answer.
		factors, err := d.DB.ListFactors(session.AccessToken)
		if err != nil || len(factors) == 0 {
			return c.JSON(fiber.Map{"success": false, "message": "MFA factor not found — contact admin to reset."})
		}
		factorID := factors[0].ID
		challengeID, err := d.DB.ChallengeTOTP(session.AccessToken, factorID)
		if err != nil {
			return c.JSON(fiber.Map{"success": false, "message": "Could not start MFA challenge."})
		}
		return c.JSON(fiber.Map{
			"success": true, "role": profile.Role, "name": profile.Name,
			"mfaRequired": true, "factorId": factorID, "challengeId": challengeID,
		})
	}

	return c.JSON(fiber.Map{"success": true, "role": profile.Role, "name": profile.Name})
}

func (d *Deps) Logout(c *fiber.Ctx) error {
	middleware.ClearSession(c)
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) Me(c *fiber.Ctx) error {
	user, ok := middleware.CurrentUser(c, d.Secret)
	if !ok {
		return c.JSON(fiber.Map{"loggedIn": false})
	}
	// Deliberately excludes SupabaseAccessToken/RefreshToken — those stay
	// inside the httpOnly cookie only, never sent to client-side JS.
	safe := fiber.Map{
		"id": user.ID, "name": user.Name, "email": user.Email,
		"role": user.Role, "class": user.Class, "childId": user.ChildID,
		"mfaVerified": user.MFAVerified, "mfaRequired": middleware.RoleRequiresMFA(user.Role),
	}
	return c.JSON(fiber.Map{"loggedIn": true, "user": safe})
}

// DebugProfile mirrors the original /debug/profile dev-only route.
func (d *Deps) DebugProfile(c *fiber.Ctx) error {
	authUsers, err := d.DB.AdminListUsers()
	if err != nil {
		return c.JSON(fiber.Map{"error": err.Error()})
	}
	var profiles []map[string]interface{}
	_ = d.UserDB(c).Select("profiles", url.Values{"select": {"*"}}, &profiles)
	d.Audit(c, "data.export", "profiles", "", fiber.Map{"note": "full profile dump via /debug/profile"})

	slim := make([]fiber.Map, 0, len(authUsers))
	for _, u := range authUsers {
		slim = append(slim, fiber.Map{"id": u.ID, "email": u.Email})
	}
	return c.JSON(fiber.Map{"authUsers": slim, "profiles": profiles})
}
