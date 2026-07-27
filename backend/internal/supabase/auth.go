package supabase

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type AuthUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// AuthSession is the real Supabase-issued session: the AccessToken is a
// signed JWT with the user's auth.uid() in it, which is what RLS policies
// check. RefreshToken lets us mint a new AccessToken without asking the
// user to log in again once the short-lived access token expires.
type AuthSession struct {
	User         AuthUser
	AccessToken  string
	RefreshToken string
	ExpiresIn    int
}

type signInResponse struct {
	AccessToken      string   `json:"access_token"`
	RefreshToken     string   `json:"refresh_token"`
	ExpiresIn        int      `json:"expires_in"`
	User             AuthUser `json:"user"`
	Error            string   `json:"error"`
	ErrorDescription string   `json:"error_description"`
	Msg              string   `json:"msg"`
}

func (c *Client) tokenRequest(grantType string, payload map[string]string) (*AuthSession, error) {
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/auth/v1/token?grant_type="+grantType, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var parsed signInResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 || parsed.AccessToken == "" {
		msg := parsed.ErrorDescription
		if msg == "" {
			msg = parsed.Msg
		}
		if msg == "" {
			msg = "invalid credentials"
		}
		return nil, fmt.Errorf("%s", msg)
	}

	return &AuthSession{
		User:         parsed.User,
		AccessToken:  parsed.AccessToken,
		RefreshToken: parsed.RefreshToken,
		ExpiresIn:    parsed.ExpiresIn,
	}, nil
}

// SignInWithPassword authenticates against Supabase GoTrue using the anon
// key, matching supabase.auth.signInWithPassword in the JS client. Unlike
// the previous version, this keeps the real access/refresh tokens instead
// of discarding them — those tokens are what let RLS actually apply to
// this user's subsequent queries.
func (c *Client) SignInWithPassword(email, password string) (*AuthSession, error) {
	return c.tokenRequest("password", map[string]string{"email": email, "password": password})
}

// RefreshSession exchanges a refresh token for a new access token, used
// when a request comes in with an expired Supabase access token but a
// still-valid app session cookie.
func (c *Client) RefreshSession(refreshToken string) (*AuthSession, error) {
	return c.tokenRequest("refresh_token", map[string]string{"refresh_token": refreshToken})
}

// ---- MFA (TOTP), via Supabase GoTrue's native multi-factor API -----------
//
// We use GoTrue's own factor enrollment rather than rolling custom TOTP
// crypto: it stores the secret, verifies codes, and issues an "aal2"
// (second-factor-verified) session for us, which is exactly the
// distinction RLS/backend checks need — the brief asks for admin/teacher
// MFA, not just an OTP screen that doesn't actually gate anything.

type MFAFactor struct {
	ID     string `json:"id"`
	Status string `json:"status"` // "unverified" | "verified"
	TOTP   struct {
		QRCode string `json:"qr_code"` // data: URI, render directly as <img>
		Secret string `json:"secret"`  // fallback for manual entry
	} `json:"totp"`
}

func (c *Client) authRequest(method, path, accessToken string, payload interface{}) ([]byte, int, error) {
	var reader io.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.baseURL+path, reader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}

// EnrollTOTP starts enrollment of a new TOTP factor for the user behind
// accessToken. Returns a factor with a QR code to scan and a secret for
// manual entry; the factor stays "unverified" until ConfirmTOTPEnroll.
func (c *Client) EnrollTOTP(accessToken string) (*MFAFactor, error) {
	body, status, err := c.authRequest(http.MethodPost, "/auth/v1/factors", accessToken, map[string]string{
		"factor_type": "totp",
	})
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("mfa enroll failed: %s", string(body))
	}
	var factor MFAFactor
	if err := json.Unmarshal(body, &factor); err != nil {
		return nil, err
	}
	return &factor, nil
}

// ChallengeTOTP starts a verification round for an existing factor
// (used both to confirm enrollment and on every subsequent login).
func (c *Client) ChallengeTOTP(accessToken, factorID string) (string, error) {
	body, status, err := c.authRequest(http.MethodPost, "/auth/v1/factors/"+factorID+"/challenge", accessToken, nil)
	if err != nil {
		return "", err
	}
	if status >= 400 {
		return "", fmt.Errorf("mfa challenge failed: %s", string(body))
	}
	var parsed struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	return parsed.ID, nil
}

// VerifyTOTP submits the 6-digit code for a challenge. On success (both
// during enrollment confirmation and during login), GoTrue returns a new
// access/refresh token pair with aal2 (second factor verified).
func (c *Client) VerifyTOTP(accessToken, factorID, challengeID, code string) (*AuthSession, error) {
	body, status, err := c.authRequest(http.MethodPost, "/auth/v1/factors/"+factorID+"/verify", accessToken, map[string]string{
		"challenge_id": challengeID,
		"code":         code,
	})
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("incorrect or expired code")
	}
	var parsed signInResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return &AuthSession{User: parsed.User, AccessToken: parsed.AccessToken, RefreshToken: parsed.RefreshToken, ExpiresIn: parsed.ExpiresIn}, nil
}

// ListFactors returns the user's enrolled MFA factors (used to check
// whether an admin/teacher already has a verified TOTP factor at login).
func (c *Client) ListFactors(accessToken string) ([]MFAFactor, error) {
	body, status, err := c.authRequest(http.MethodGet, "/auth/v1/user", accessToken, nil)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("could not fetch user: %s", string(body))
	}
	var parsed struct {
		Factors []MFAFactor `json:"factors"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return parsed.Factors, nil
}

type listUsersResponse struct {
	Users []AuthUser `json:"users"`
}

// AdminListUsers lists all auth users via the GoTrue admin API (service key).
func (c *Client) AdminListUsers() ([]AuthUser, error) {
	req, err := http.NewRequest(http.MethodGet, c.baseURL+"/auth/v1/admin/users", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("admin listUsers failed: %s", string(body))
	}

	var parsed listUsersResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return parsed.Users, nil
}
