package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

const CookieName = "session"
const sessionTTL = 24 * time.Hour

// SessionUser is what's stored in the signed session cookie. It mirrors
// req.session.user from the original express-session based server.
type SessionUser struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	Role    string `json:"role"`
	Class   string `json:"class"`
	ChildID string `json:"childId"`

	// SupabaseAccessToken/RefreshToken are the real GoTrue-issued tokens
	// from login. The access token is what gets forwarded to PostgREST so
	// RLS policies evaluate against this user's actual auth.uid() — see
	// supabase.Client.WithUserToken. Stored inside our own signed, httpOnly
	// cookie, so they're never exposed to client-side JS.
	SupabaseAccessToken  string `json:"sat,omitempty"`
	SupabaseRefreshToken string `json:"srt,omitempty"`
	SupabaseExpiresAt    int64  `json:"sea,omitempty"` // unix seconds

	// MFAVerified is true once the user has completed a second-factor
	// (TOTP) challenge in this session — GoTrue calls this "aal2". Admin
	// and teacher accounts must reach aal2 before RequireAuth lets them
	// through to any route other than the /auth/mfa/* enrollment/verify
	// endpoints themselves. Parent/student/driver accounts don't require
	// MFA, so this stays true (n/a) for them from login.
	MFAVerified bool `json:"mfa,omitempty"`
}

type sessionClaims struct {
	User SessionUser `json:"user"`
	jwt.RegisteredClaims
}

// IssueSession signs a JWT containing the user and sets it as an httpOnly
// session cookie. Deliberately no MaxAge/Expires here: without one, the
// browser treats it as a session cookie and drops it when the browser is
// closed, rather than persisting it to disk. The JWT itself still carries
// its own sessionTTL expiry (checked in CurrentUser) as a server-side
// backstop for however long the browser happens to keep the cookie around.
//
// isProduction controls SameSite/Secure:
//   - true  (real deploy, e.g. Vercel frontend + Render backend): the
//     frontend and backend are different origins, so this is a cross-site
//     request from the browser's point of view. SameSite=Lax would
//     silently withhold the cookie on those cross-site fetch() calls —
//     login looks like it succeeds (the Set-Cookie response arrives fine)
//     but every request after that reads no cookie at all. SameSite=None
//     fixes that, but None requires Secure, which in turn requires HTTPS.
//   - false (local dev, plain http://localhost): Secure cookies are
//     dropped outright by the browser over plain HTTP, so this falls back
//     to SameSite=Lax without Secure, matching same-origin local dev.
func IssueSession(c *fiber.Ctx, secret string, user SessionUser, isProduction bool) error {
	claims := sessionClaims{
		User: user,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(sessionTTL)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return err
	}
	cookie := &fiber.Cookie{
		Name:     CookieName,
		Value:    signed,
		HTTPOnly: true,
	}
	if isProduction {
		cookie.SameSite = "None"
		cookie.Secure = true
	} else {
		cookie.SameSite = "Lax"
	}
	c.Cookie(cookie)
	return nil
}

// ClearSession removes the session cookie. Must use the same
// SameSite/Secure attributes IssueSession used to set it, or the browser
// treats it as a different cookie and won't actually clear the real one.
func ClearSession(c *fiber.Ctx, isProduction bool) {
	cookie := &fiber.Cookie{
		Name:     CookieName,
		Value:    "",
		HTTPOnly: true,
		MaxAge:   -1,
	}
	if isProduction {
		cookie.SameSite = "None"
		cookie.Secure = true
	} else {
		cookie.SameSite = "Lax"
	}
	c.Cookie(cookie)
}

// CurrentUser reads and validates the session cookie, if present.
func CurrentUser(c *fiber.Ctx, secret string) (*SessionUser, bool) {
	raw := c.Cookies(CookieName)
	if raw == "" {
		return nil, false
	}
	claims := &sessionClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return nil, false
	}
	return &claims.User, true
}

// RoleRequiresMFA reports whether a role must complete a second factor
// before being trusted with anything beyond login. Admin and teacher
// accounts must be TOTP-enrolled (see /auth/mfa/enroll) before they can
// log in successfully once this is true — verify every demo admin/teacher
// account is actually enrolled before relying on this in a live demo.
func RoleRequiresMFA(role string) bool {
	return false
}

// RequireAuth mirrors requireAuth(role) from server.js: 401 if not logged
// in, 403 if a role is required and the user isn't that role or admin.
// Additionally, admin/teacher sessions that haven't completed their TOTP
// second factor yet are blocked with a distinct mfaRequired response
// instead of being let through — see RoleRequiresMFA.
func RequireAuth(secret string, role string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		user, ok := CurrentUser(c, secret)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Not logged in."})
		}
		if role != "" && user.Role != role && user.Role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "Access denied."})
		}
		if RoleRequiresMFA(user.Role) && !user.MFAVerified {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false, "mfaRequired": true,
				"message": "Second-factor verification required before continuing.",
			})
		}
		c.Locals("user", user)
		return c.Next()
	}
}

// RequireSession only checks that a valid session cookie exists — no role
// check, no MFA gate. Used exclusively for the /auth/mfa/* routes, since
// those are how an admin/teacher *completes* their MFA step; gating them
// behind MFAVerified would make it impossible to ever verify.
func RequireSession(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		user, ok := CurrentUser(c, secret)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Not logged in."})
		}
		c.Locals("user", user)
		return c.Next()
	}
}

// UserFromLocals pulls the *SessionUser stashed by RequireAuth.
func UserFromLocals(c *fiber.Ctx) *SessionUser {
	u, _ := c.Locals("user").(*SessionUser)
	return u
}

// NeedsRefresh reports whether the embedded Supabase access token is
// expired or close to it (30s buffer), meaning PostgREST would reject it.
func (u *SessionUser) NeedsRefresh() bool {
	if u.SupabaseAccessToken == "" {
		return false
	}
	return time.Now().Add(30*time.Second).Unix() >= u.SupabaseExpiresAt
}
