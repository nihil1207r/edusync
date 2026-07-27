package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	SupabaseURL        string
	SupabaseServiceKey string
	SupabaseAnonKey    string
	SessionSecret      string
	Port               string
	// AllowedOrigin is the single frontend origin allowed to make
	// credentialed CORS requests to this API. Was previously hardcoded to
	// http://localhost:3001 in main.go, which would silently keep accepting
	// only localhost even after a real deploy. Now read from FRONTEND_ORIGIN,
	// e.g. https://app.example.com, with the old localhost value as a dev
	// default.
	AllowedOrigin string
	// IsProduction gates behavior that should never run in a live
	// deployment — currently just /admin/seed (see router.go).
	IsProduction bool
}

func Load() *Config {
	// .env is optional (e.g. in prod, vars come from the environment directly)
	_ = godotenv.Load()

	env := os.Getenv("APP_ENV")
	cfg := &Config{
		SupabaseURL:        mustEnv("SUPABASE_URL"),
		SupabaseServiceKey: mustEnv("SUPABASE_SERVICE_KEY"),
		SupabaseAnonKey:    mustEnv("SUPABASE_ANON_KEY"),
		SessionSecret:      mustEnv("SESSION_SECRET"),
		Port:               os.Getenv("PORT"),
		AllowedOrigin:      os.Getenv("FRONTEND_ORIGIN"),
		IsProduction:       env == "production",
	}
	if cfg.Port == "" {
		cfg.Port = "3000"
	}
	if cfg.AllowedOrigin == "" {
		cfg.AllowedOrigin = "http://localhost:3001"
	}
	if cfg.IsProduction && len(cfg.SessionSecret) < 32 {
		log.Fatal("SESSION_SECRET must be at least 32 characters in production")
	}
	return cfg
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("missing required env var: %s", key)
	}
	return v
}
