import { defineConfig, devices } from "@playwright/test";

/**
 * Requires a running instance of both the Go backend (with a real Supabase
 * project behind it, migrated + seeded via scripts/seed.ts) and the Next.js
 * frontend — see NOTES.md. These specs were written and structurally
 * validated (`npx playwright test --list`) in this environment, but not
 * executed against a live instance, since no real Supabase credentials or
 * browser binaries are available in this sandbox.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
