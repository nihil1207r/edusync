// Package supabase is a small REST client for Supabase's PostgREST and
// GoTrue APIs. There is no official/stable Supabase SDK for Go, so this
// talks to the same HTTP endpoints that @supabase/supabase-js uses.
package supabase

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	baseURL    string // e.g. https://xxxx.supabase.co
	serviceKey string
	anonKey    string
	userToken  string // if set, requests act as this end-user (see WithUserToken)
	http       *http.Client
}

func New(baseURL, serviceKey, anonKey string) *Client {
	// Go's http.DefaultTransport caps idle keep-alive connections at 2 per
	// host. Every request this client makes goes to the same host (the
	// Supabase project URL), so that default forces a fresh TCP+TLS
	// handshake for any request beyond 2 concurrent in-flight ones. Raising
	// it here is what actually lets this client reuse connections under
	// real concurrent load instead of just in a single-request demo.
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 100,
		IdleConnTimeout:     90 * time.Second,
	}
	return &Client{
		baseURL:    baseURL,
		serviceKey: serviceKey,
		anonKey:    anonKey,
		http:       &http.Client{Timeout: 15 * time.Second, Transport: transport},
	}
}

// WithUserToken returns a shallow copy of the client that authenticates as
// the given end-user's Supabase access token (the JWT issued by GoTrue at
// login) instead of the service-role key. This is what makes RLS the real
// enforcement boundary: PostgREST evaluates auth.uid() from this token, so
// a parent's queries are actually restricted to their own children's rows
// by Postgres itself, not just by application code remembering to filter.
//
// Use the plain (service-role) client only for operations that must
// legitimately bypass RLS: GoTrue admin calls, the dev-only seed script,
// and the Razorpay webhook (which has no end-user session to act as).
func (c *Client) WithUserToken(token string) *Client {
	clone := *c
	clone.userToken = token
	return &clone
}

// IsUserScoped reports whether this client is acting as an end-user (true)
// or using the service-role key (false, bypasses RLS).
func (c *Client) IsUserScoped() bool { return c.userToken != "" }

// APIError mirrors an error response body from PostgREST/GoTrue.
type APIError struct {
	StatusCode int
	Message    string
	Body       []byte
}

func (e *APIError) Error() string {
	return fmt.Sprintf("supabase: status %d: %s", e.StatusCode, e.Message)
}

// request performs a raw HTTP call against the Supabase REST (PostgREST) API,
// using the service-role key (server-side, bypasses RLS by design since this
// mirrors the original service-key usage in server.js).
func (c *Client) request(method, path string, query url.Values, body interface{}, extraHeaders map[string]string) ([]byte, error) {
	u := c.baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, u, reader)
	if err != nil {
		return nil, err
	}
	if c.userToken != "" {
		// Act as the end-user: PostgREST/Postgres evaluates RLS policies
		// against this JWT's auth.uid(), not the service role.
		req.Header.Set("apikey", c.anonKey)
		req.Header.Set("Authorization", "Bearer "+c.userToken)
	} else {
		req.Header.Set("apikey", c.serviceKey)
		req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return respBody, &APIError{StatusCode: resp.StatusCode, Message: string(respBody), Body: respBody}
	}
	return respBody, nil
}

// Select runs a GET against /rest/v1/{table} with the given PostgREST query
// params (e.g. select, eq filters, order, limit) and decodes into out.
func (c *Client) Select(table string, query url.Values, out interface{}) error {
	body, err := c.request(http.MethodGet, "/rest/v1/"+table, query, nil, nil)
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(body, out)
}

// SelectOne is like Select but expects/decodes a single row (adds the
// "Accept: application/vnd.pgrst.object+json" header, matching .single()).
func (c *Client) SelectOne(table string, query url.Values, out interface{}) error {
	body, err := c.request(http.MethodGet, "/rest/v1/"+table, query, nil, map[string]string{
		"Accept": "application/vnd.pgrst.object+json",
	})
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(body, out)
}

// Insert inserts one or more rows. If returning is true, the inserted rows
// are decoded into out (pass a pointer to a slice).
func (c *Client) Insert(table string, rows interface{}, returning bool, out interface{}) error {
	headers := map[string]string{}
	if returning {
		headers["Prefer"] = "return=representation"
	}
	body, err := c.request(http.MethodPost, "/rest/v1/"+table, nil, rows, headers)
	if err != nil {
		return err
	}
	if returning && out != nil {
		return json.Unmarshal(body, out)
	}
	return nil
}

// Upsert inserts rows or updates them on conflict of onConflict columns.
func (c *Client) Upsert(table string, rows interface{}, onConflict string, returning bool, out interface{}) error {
	q := url.Values{}
	if onConflict != "" {
		q.Set("on_conflict", onConflict)
	}
	pref := "resolution=merge-duplicates"
	if returning {
		pref += ",return=representation"
	}
	body, err := c.request(http.MethodPost, "/rest/v1/"+table, q, rows, map[string]string{"Prefer": pref})
	if err != nil {
		return err
	}
	if returning && out != nil {
		return json.Unmarshal(body, out)
	}
	return nil
}

// Update updates rows matching the given filters (e.g. {"id": "eq.123"}).
func (c *Client) Update(table string, filters url.Values, patch interface{}) error {
	_, err := c.request(http.MethodPatch, "/rest/v1/"+table, filters, patch, nil)
	return err
}

// Eq is a small helper for building a PostgREST equality filter value.
func Eq(v string) string { return "eq." + v }
