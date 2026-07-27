package main

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"

	"edunexus/backend/internal/cache"
	"edunexus/backend/internal/config"
	"edunexus/backend/internal/handlers"
	"edunexus/backend/internal/supabase"
)

func main() {
	cfg := config.Load()
	db := supabase.New(cfg.SupabaseURL, cfg.SupabaseServiceKey, cfg.SupabaseAnonKey)
	deps := &handlers.Deps{DB: db, Secret: cfg.SessionSecret, IsProduction: cfg.IsProduction, Cache: cache.New()}

	app := fiber.New()

	// Compress JSON responses over the wire. LevelBestSpeed rather than
	// LevelBestCompression: this is a request/response API where latency
	// matters more than shaving a few extra bytes, so we want the cheap
	// CPU tradeoff, not the maximal one.
	app.Use(compress.New(compress.Config{Level: compress.LevelBestSpeed}))

	// Security headers. This is an API-only backend (no HTML views), so the
	// CSP is intentionally locked down to "nothing renders here" — the
	// Next.js frontend has its own CSP for the actual UI (see next.config.ts).
	app.Use(helmet.New(helmet.Config{
		ContentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
		XFrameOptions:         "DENY",
		XSSProtection:         "0", // deprecated header; explicitly off rather than silently missing
		ReferrerPolicy:        "no-referrer",
	}))

	// Global baseline: blunt casual abuse/basic traffic spikes at the app
	// level. A CDN/edge network (Cloudflare, Vercel edge) in front of this
	// is still the right place for real volumetric DDoS mitigation — see
	// NOTES.md.
	app.Use(limiter.New(limiter.Config{
		Max:        120,
		Expiration: time.Minute,
	}))

	// The frontend is now a separate Next.js app on its own origin, so it
	// needs CORS + credentialed cookies (unlike the original single-server
	// Express+static-HTML setup where everything shared one origin).
	app.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigin, // set FRONTEND_ORIGIN in prod, e.g. https://app.example.com
		AllowCredentials: true,
		AllowHeaders:     "Content-Type",
	}))

	deps.RegisterRoutes(app)

	log.Printf("✅ EduNexus API running on port %s", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
