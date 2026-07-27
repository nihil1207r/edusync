// Package cache provides a small in-memory TTL cache for short-lived
// caching of read-heavy handler responses.
//
// Deliberately simple: no eviction beyond TTL expiry, no size cap, and it
// only helps within a single process. That's the honest tradeoff — this is
// appropriate for cutting duplicate load at this app's current scale, not a
// drop-in substitute for Redis if this ever runs as multiple instances
// behind a load balancer (each instance would keep its own cache, so a
// write on instance A wouldn't invalidate instance B's copy).
package cache

import (
	"sync"
	"time"
)

type entry struct {
	data      []byte
	expiresAt time.Time
}

type Cache struct {
	mu      sync.RWMutex
	entries map[string]entry
}

func New() *Cache {
	return &Cache{entries: make(map[string]entry)}
}

// Get returns the cached bytes for key, or ok=false if missing or expired.
func (c *Cache) Get(key string) (data []byte, ok bool) {
	c.mu.RLock()
	e, found := c.entries[key]
	c.mu.RUnlock()
	if !found || time.Now().After(e.expiresAt) {
		return nil, false
	}
	return e.data, true
}

// Set stores data under key for the given ttl.
func (c *Cache) Set(key string, data []byte, ttl time.Duration) {
	c.mu.Lock()
	c.entries[key] = entry{data: data, expiresAt: time.Now().Add(ttl)}
	c.mu.Unlock()
}

// Invalidate removes key immediately. Call this after any write that would
// make a cached read stale before its TTL naturally expires.
func (c *Cache) Invalidate(key string) {
	c.mu.Lock()
	delete(c.entries, key)
	c.mu.Unlock()
}
