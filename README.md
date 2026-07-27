# EduNexus

A school management platform: teacher / parent / student / admin dashboards,
attendance, grades, homework, announcements, wellness check-ins, gate passes,
and a teacher↔parent chat.

Rewritten from the original Express + static-HTML app into:

- **Frontend:** Next.js 16 (App Router) + React + TypeScript — `frontend/`
- **Backend:** Go + Fiber — `backend/`
- **Database/Auth:** Supabase (Postgres + GoTrue), same project as before

Redis, OpenSearch, RabbitMQ, Docker, Kubernetes, and Grafana/Prometheus were
deliberately left out of this pass — the goal here was full feature parity on
the core stack first. See "Notes & next steps" below.

## v2: fees, notices, leave, bus tracking, AI insight

A second pass added a slice of ideas from an "EduSync" brief, merged into
this same Go backend rather than rebuilt on a separate stack:

- **Fees** — admin sets fee line items; parent/student view status + pay via
  Razorpay (real order-creation + signature-verified webhook, needs real
  Razorpay keys to actually process a payment — see `NOTES.md`).
- **Notices** — audience-targeted broadcasts (whole school / a class / a
  role), reusing the existing announcements table.
- **Leave requests** — student applies, teacher approves/denies.
- **Bus tracking** — admin manages routes/buses, a driver posts live GPS
  pings, parents/students see it move on a MapLibre map via Server-Sent
  Events (not Supabase Realtime — see `NOTES.md` for why).
- **AI Insight Layer (partial)** — a daily one-paragraph summary per student
  ("Invisible Parent") and a Silent Student flag for teachers. Works with
  zero credentials (rule-based); upgrades automatically to a real Gemini API
  call (free tier, see NOTES.md) if `GEMINI_API_KEY` is set.

Run every file in `backend/migrations/` against your Supabase project, **in
numeric order starting with `001_base_schema.sql`** — 001 is the base
schema (profiles, students, attendance, grades, homework, wellness,
announcements, gatepasses, chats), reconstructed from what the backend
actually queries; everything from `002` onward is additive on top of it.
All are safe to run once, in order, against a fresh project.

**Security baseline added:** rate limiting (global + strict on login, seed,
and the Razorpay webhook), security headers on both the Go API and the
Next.js app (real CSP, HSTS, X-Frame-Options, etc.), and RLS policies for
every table. The RLS policies are real and enable-able, but — important —
the Go backend still queries Supabase with the service-role key, which
bypasses RLS by design, so today they're a second, currently-inert layer of
defense rather than the actual enforcement point. Full explanation in
`NOTES.md`.

**Not built:** the rest of the AI Insight Layer's 10 features (Classroom
Energy, Friendship Intelligence, School Memory, AI Simulator, Parent
Personality, AI Meeting Prep), MFA, audit logging, and the Vitest/Playwright
test suite from the original brief. See `NOTES.md` for the full, honest list
of what's real vs. stubbed vs. skipped.

## Running it

### 0. Database (Supabase)

1. Create a Supabase project, then in its SQL editor run every file in
   `backend/migrations/` in numeric order, starting with
   `001_base_schema.sql`.
2. In Supabase Auth → Users, manually create these four demo users (any
   password you like — that's what you'll actually log in with):
   `admin@edunexus.com`, `priya@edunexus.com`, `arjun@edunexus.com`,
   `rahul@edunexus.com`. The seed script matches profiles to these by
   email; it doesn't create auth users itself.

### 1. Backend (Go)

```bash
cd backend
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, SESSION_SECRET
go run main.go
```

Runs on `http://localhost:3000` by default (set `PORT` to change it).

### 2. Frontend (Next.js)

```bash
cd frontend
cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL should point at the backend above
npm install
npm run dev -- -p 3001
```

Runs on `http://localhost:3001`. Open it and sign in — the login page has
demo-account buttons that autofill the same seeded credentials as the
original app (`priya@edunexus.com` / `teacher123`, etc.).

If you haven't seeded the Supabase project yet, `POST /admin/seed` with
`{"password": "admin123"}` against the backend (same as the original app)
will populate demo profiles, students, grades, attendance, homework, and a
sample chat thread.

## What changed from the original, and why

- **Sessions:** the original used `express-session` (in-memory store) — this
  build signs a JWT and stores it in an httpOnly cookie instead, since there's
  no Redis in this pass to back a server-side session store. Functionally
  equivalent for a single backend instance; would need a shared store (Redis)
  once you run more than one backend replica.
- **Supabase client:** there's no official, stable Supabase SDK for Go, so
  the backend talks directly to Supabase's REST (PostgREST) and Auth (GoTrue)
  HTTP APIs — the same endpoints `@supabase/supabase-js` calls under the hood.
- **CORS:** frontend and backend are now separate origins (`3001` and `3000`),
  so the backend has a CORS layer with credentialed cookies enabled, which the
  original single-server app didn't need.
- **Preserved a quirk on purpose:** the student gate-pass endpoint stores the
  logged-in user's own auth ID as `student_id` (not their linked child
  record's ID) — that's inherited as-is from the original `server.js` for
  parity. Worth fixing if it's actually a bug and not intentional.
- **Dropped two UI-only tabs** that existed in the original HTML (parent "Bus
  Tracking", admin "Notifications"/"Reports") because they had no backing API
  route in `server.js` — rather than invent fake data for them, they're left
  out. Happy to build real versions if you want that functionality.

## Notes & next steps

- Backend and frontend both build and type-check cleanly (`go build ./...`,
  `go vet ./...`, `tsc --noEmit`, `eslint`, `next build` all pass), but
  neither has been run against a live Supabase project in this environment —
  worth a smoke test against your actual project before deploying.
- Redis: would slot in for session storage (multi-instance) and for caching
  hot reads like the teacher dashboard.
- OpenSearch: would matter once search across students/announcements/homework
  needs to be fast/fuzzy at scale — not needed yet at this data size.
- RabbitMQ: useful once things like wellness-alert notifications or
  gate-pass approvals need to fan out asynchronously (e.g. to email/SMS).
- Docker/K8s: a `docker-compose.yml` for local dev (backend + frontend +
  those infra pieces) is a reasonable next step once you're ready to wire
  them in, rather than scaffolding empty service definitions now.
