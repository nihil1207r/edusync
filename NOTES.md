# NOTES

Honest accounting of what's real, what's stubbed, and what's out of scope in
this pass — so nothing here is silently faked.

## Gamification additions (post-Phase-5 addendum)

Four mechanics added on top of the existing points/badges system, all
computed from data this app already collects — no new fabricated scores,
and (per the brief's section 6) kept entirely separate from the AI Insight
Layer, which stays calm/non-gamified on purpose. No new tables were needed
for any of these:

- **Curiosity bounty**: `engagement_logs.curiosity` (Phase 3) already
  captured curiosity separately from participation, but nothing acted on
  it. A rating of 4+ now awards +10 points automatically (hooked into
  `CreateEngagementLog`) and logs the award to `school_events_index` so
  it's visible in the student's own history, not just a silent number
  change. Repeatable — every high-curiosity session earns one, not a
  one-time achievement.
- **Skill tree**: `GET /api/student/skill-tree` groups a student's real
  exam results (via `grades.exam_id → exams`, linked since Phase 1) by
  subject, chronologically. No fabricated curriculum/prerequisite graph —
  the "tree" is literally the sequence of exams that actually happened,
  with one visible "locked" next-node as a goal. A node is "mastered" at
  80%+, "current" for the most recent result, "cleared" otherwise.
- **Commute streak**: `GET /api/student/commute-streak` counts consecutive
  calendar days with a real `boarded` row in `boarding_events` (from the
  bus-tracking work in Phase 2), ending today-or-yesterday so the streak
  doesn't visually reset before a student has had a chance to ride today.
  Milestone badges (5/10/20/50 days) are appended to `students.badges`
  the first time each is reached, checked against the existing badge list
  so recomputation never double-awards.
- **You vs. past-you**: `GET /api/student/progress-comparison` compares
  this calendar month to last calendar month for attendance rate,
  homework-submitted-on-time rate, and average grade % — **always against
  the same student's own past performance, never against classmates** (a
  deliberate design choice — see the ideation conversation: public ranking
  by ability was flagged as the thing to avoid, effort/consistency/growth
  framing is what the mechanics lean into instead).
- Frontend: a new "Skill Tree" tab (visual, per-subject) and an expanded
  "Achievements" tab (streak + curiosity bounty count/history + the
  month-over-month comparison, alongside the pre-existing points/badges
  display) on both the student and parent dashboards. Teachers seeing a
  curiosity-bounty award get a small inline toast right where they log
  engagement, not a separate notification system.
- Full test pass for this slice: added Go unit tests for the pure parts
  (`highestReachedMilestone`, `examDateOf`) — `go build`/`go vet`/`go test`
  all clean; frontend `tsc --noEmit`/`next build`/`vitest run` all clean.

## Base schema migration added (post-Phase-5 addendum)

`backend/migrations/001_base_schema.sql` was added after the 5 phases below,
in response to running this against a genuinely empty Supabase project —
migrations 002-008 are all additive and assume tables like `profiles` and
`students` already exist, which was true of the original app pass but isn't
true of a fresh project. 001 reconstructs that base schema by reading
exactly what the Go backend and Next.js frontend query (every `.Select`/
`.Insert`/`.Upsert` call across `internal/handlers/*.go`), not from the
original brief's aspirational schema sketch — a few things differ, e.g.
`class` is a plain text column here rather than a foreign key to a separate
`classes` table, matching how the rest of this codebase actually treats it.
**Verified for real**: ran `001` through `008` back-to-back against a local
Postgres 16 instance (with `auth.users`/`auth.uid()`/`auth.role()` stubbed
to stand in for Supabase's own Auth schema) — all 8 files applied with zero
errors, producing the expected 35 tables. See the header comment in
`001_base_schema.sql` for the two manual one-time setup steps (creating the
demo Supabase Auth users, then calling `/admin/seed`) needed after running it.

## Phase 1 of the 5-phase plan (done): Tier 1 completion

Added since the last snapshot, against the "Still not built" list below:

- **Timetable**: `timetable_slots` table + RLS (everyone logged in reads,
  staff write). Admin creates/edits slots per class/day/period; student,
  parent, and teacher views read the same endpoint, defaulting to the
  logged-in family's own class.
- **Exams & Results**: `exams` table (schedule) + RLS. Teachers schedule
  exams per class/subject/date, then enter marks per student, which upserts
  into the existing `grades` table (now with an `exam_id` link) — this is
  the grade-override write path the previous pass's NOTES flagged as
  missing entirely. Every write is audit-logged (actor + diff) per the
  section 5 baseline. Students/parents see upcoming exams and results on
  the same "Exams & Results" tab; the raw marks-table view (Grades tab)
  from the previous pass is unchanged.
- **Document repository**: `documents` table + RLS, metadata-only in this
  pass (see stub note below). Teachers/admins share a document scoped to a
  student, a class, or the whole school; students/parents/teachers/admin
  each see the right slice via a real Supabase query, not a hardcoded list.
- Full test pass for this slice: Go backend builds and vets clean
  (`go build ./...`, `go vet ./...`); Next.js frontend type-checks and
  produces a clean production build (`tsc --noEmit`, `next build`) with all
  four role pages compiling. No hardcoded arrays were added to shipped
  components — every new screen reads from `/api/timetable`, `/api/exams`,
  `/api/teacher/results`, `/api/documents`.

New integration stub, same pattern as Razorpay/LLM/GPS below: **document
file storage**. `POST /api/teacher/documents` and `/api/admin/documents`
accept a `fileUrl` pointing at wherever the file already lives — there is
no Supabase Storage bucket wired up in this environment, so actual file
upload/hosting is not implemented. Wiring a real bucket (and switching
`fileUrl` to be populated by an upload step) is the natural next step once
storage credentials exist.

## Phase 2 of the 5-phase plan (done): Tier 2 completion

- **Geofence-triggered notifications**: `bus_geofence_events` table + RLS.
  Every driver location ping (`POST /api/driver/location`) now also runs a
  real haversine-distance check against the bus's route stops (150m
  radius); crossing into/out of that radius inserts `arrived`/`departed`
  rows, which the parent/student bus map polls and shows as a feed.
  `delayed`/`breakdown` are driver-declared, not geofence-inferred — there's
  no reliable way to detect "delayed" from GPS position alone without a
  live traffic feed, so this app doesn't pretend to.
- **ETA calculation**: `bus_location_history` logs every ping; `GET
  /api/bus/eta` estimates speed from the two most recent points and divides
  the remaining distance to the child's assigned stop by that speed. A
  stationary/idling bus would otherwise make the ETA blow up toward
  infinity, so speeds under 3 km/h fall back to a documented 20 km/h
  average instead — the response marks `speedEstimated: false` in that
  case and the UI labels it "average-speed estimate," matching the
  brief's "label outputs as estimates" rule.
- **Driver app view** (was silently missing before — brief section 8 calls
  for it, the previous pass's NOTES didn't flag it): `/driver` page —
  start/end route (posts real GPS via the browser's Geolocation API, not
  simulated), mark boarding/alighting per student, report delay/breakdown,
  and an SOS button. Requires an admin to link a driver's login to a bus
  (`driver_id` on `buses`, added this pass) via the new dropdown in Admin
  → Buses & Routes; falls back to matching `driver_name` for buses created
  before this link existed.
- **Route stops**: previously routes were created with an empty `stops`
  array and there was no way to add to it — meaning geofence/ETA would
  have had nothing to key off of. Added `POST /api/admin/routes/stops` and
  an admin UI to add stops (name/lat/lng) per route.
- **SOS alerts**: `sos_alerts` table, RLS-restricted to staff + the
  reporting driver (unlike bus location/geofence data, which — matching
  the existing `bus_locations` policy from the earlier pass — is treated
  as broadcast operational info readable by anyone logged in). Visible to
  teacher/admin on both their dashboards, with a resolve action, audit-
  logged.
- Full test pass for this slice: Go backend builds and vets clean; Next.js
  frontend type-checks and produces a clean production build, including
  the new `/driver` route.

## Phase 3 of the 5-phase plan (done): AI Insight Layer batch 1

Three new tables, added faithfully to the brief's original data model
(`engagement_logs`, `class_energy_logs`, `peer_relationships`,
`school_events_index` — none of which existed before this pass, alongside
Phase A/B's existing tables):

- **Classroom Energy**: teachers log a one-tap 1-5 rating per period
  (`class_energy_logs`). `GET /api/teacher/classenergy/insights` aggregates
  real logged sessions into observations like "Mondays average 2.8/5 vs an
  overall 3.6/5" — every observation states its sample size and only
  appears once at least 3 sessions support it, per the brief's "present as
  observations with sample size shown" rule. Note: this can only speak to
  per-*period* patterns, not literal minute-by-minute attention curves —
  the brief's "attention drops after N minutes" framing isn't something a
  once-per-period tap can actually measure, so the UI doesn't claim it.
- **Friendship Intelligence**: `engagement_logs` (a teacher's one-tap
  participation/confidence/curiosity rating per student per session) is the
  real evidence source. `POST /api/teacher/friendship/generate` computes
  each student's participation average against the class average and
  inserts `isolation_risk` and `suggested_seating` candidates — always
  `status='suggested'`, always disclosing the underlying stats
  ("participation averages 2.1/5 over 5 sessions vs a class average of
  3.4/5"), and always requiring a teacher's accept/reject
  (`/api/teacher/friendship/respond`) before it means anything. This is
  deliberately not a sophisticated peer-graph model — there's no real
  signal in this app for who talks to whom — so it doesn't pretend to
  infer more than the data supports. A teacher can also log a direct
  observation ("X explains well to Y") via
  `/api/teacher/friendship/observe`, inserted pre-accepted since the
  teacher asserted it directly rather than the system inferring it. Staff-
  only end to end — RLS never exposes this to parents/students.
- **School Memory**: `school_events_index`, populated two ways — (1)
  automatically, hooked into the exam-result and certificate-sharing
  endpoints built in Phases 1/2, so "who scored what" and "who received
  which certificate" show up without extra effort, and (2) manually, via a
  teacher/admin form, for things this app has no dedicated tracker for
  (club participation, awards). `GET /api/school-memory/search` answers
  queries like "who's participated in robotics" with a rule-based
  keyword-extraction parser (no credentials needed) that runs a real
  parameterized ILIKE query — never free text reaching SQL directly. With
  `GEMINI_API_KEY` set, a two-pass Gemini extraction (draft, then a second
  pass that reviews that draft against the original question) extracts the
  same `{keywords, eventType}` shape from the question, then the identical safe
  query path runs — the LLM only interprets the question, it never
  generates the answer. Family users can search their own child's history;
  RLS restricts what comes back either way.
- Full test pass for this slice: Go backend builds and vets clean; Next.js
  frontend type-checks and produces a clean production build.

## Phase 4 of the 5-phase plan (this pass): AI Insight Layer batch 2

- **AI School Simulator**: `POST /api/admin/simulate` recognizes two
  question shapes (a timing shift like "delay start by 20 minutes", or an
  exam cancellation/postponement) and estimates effects using real current
  baseline data — actual attendance rate over the last 500 recorded days,
  actual average pending-homework count, and an average bus travel time
  estimated from real `bus_location_history`. The coefficients that turn
  those baselines into a prediction (e.g. "-0.05 percentage points of
  attendance per minute of shift") are simple, disclosed in the response's
  `method` field, and explicitly labeled as an undemonstrated assumption —
  this app has no record of a past timing change to actually learn a real
  coefficient from, so it doesn't pretend to have one. Every scenario is
  stored in `simulation_scenarios` with its full baseline and output for
  auditability. Unrecognized questions get the real baseline back with an
  honest "couldn't identify a specific change" message instead of a
  fabricated answer.
- **Parent Personality**: `message_reads` logs which delivery action a
  parent actually takes on their daily summary — expand to
  detail, use the browser's built-in text-to-speech to listen, or leave it
  concise — and `parent_communication_prefs` is recomputed from the last 30
  real logged actions (only once there are ≥5, otherwise it stays at the
  documented "concise" default rather than guessing early). `DailySummaryCard`
  reads this back and defaults to the learned view. One deliberate omission:
  there's no "visual" (chart) action wired up for this card, even though the
  schema supports the format — adding a chart/visual mode here would
  directly contradict section 6's instruction that this exact feature
  "must feel calm... not another dashboard with charts," so the honest
  choice was to leave that format un-exercised rather than force a fake
  visual to complete the set.
- **AI Meeting Prep**: `POST /api/teacher/meeting-prep` builds a brief from
  the same real data as Invisible Parent (attendance, homework, wellness)
  plus grades and any accepted Friendship Intelligence isolation-risk flag
  — every achievement/concern/action is traceable to a number in the
  response's `sourceData`, nothing is invented. Teachers generate it;
  parents and students can view (not regenerate) their own via the same
  RLS pattern already used for grades/attendance elsewhere in this
  codebase — worth noting as a judgment call, since a real deployment
  might prefer to keep teacher-facing "concerns" language parent-only and
  hide it from the student view specifically.
- Full test pass for this slice: Go backend builds and vets clean; Next.js
  frontend type-checks and produces a clean production build.

## Phase 5 of the 5-phase plan (this pass): tests, dependency scan, final review

**Test suite.** Following section 4's requirement, this pass adds the
Vitest/Playwright suite that was previously missing:

- **Go unit tests** (`internal/handlers/pure_logic_test.go`,
  `internal/middleware/auth_test.go`): cover the pure logic added across
  all four phases — haversine distance math (including a check that ~50m
  apart is correctly inside the 150m geofence radius), letter-grade
  boundaries, engagement-score clamping, mean/confidence calculations for
  Classroom Energy and Friendship Intelligence, the School Memory
  keyword-extraction parser (including stopword stripping), the
  Simulator's minute-extraction/rounding/fallback logic, and MFA
  role-gating. `go test ./...` — **all passing**.
- **Frontend Vitest tests** (`src/lib/api.test.ts`): 6 tests against the
  shared `api()` fetch wrapper — credentials/JSON headers always sent,
  correct parsing on success, the deliberate non-throwing behavior on
  401/403 (callers read `success:false` instead), throwing `ApiError` on
  other failures, and correct GET/POST body shape. **All passing**
  (`npm run test` / `vitest run`).
- **Playwright e2e specs** (`e2e/*.spec.ts`, `playwright.config.ts`): one
  spec file per critical flow named in section 4 — login (incl. an
  invalid-password case), fee payment, bus tracking (map + ETA + geofence
  feed), homework submission, and daily-summary generation (incl. a check
  that the summary card has no chart/canvas element, enforcing section 6's
  "calm, not gamified" rule, and that expanding "detailed" reveals real
  `sourceData`, not a fabricated breakdown). 12 tests total across 5 files.
  **Not executed against a live instance** — this sandbox has no real
  Supabase project (the backend needs one to do anything) and no browser
  binaries for Playwright to drive. They were structurally validated with
  `npx playwright test --list`, which confirmed all 12 parse and resolve
  correctly against the actual page markup (verified selectors against the
  real button/placeholder text in each page's source). Before a real
  submission, run `npx playwright install && E2E_BASE_URL=http://localhost:3001 npx playwright test`
  against a seeded dev instance.
- Full regression check after adding all of the above: `go build ./...`,
  `go vet ./...`, `tsc --noEmit`, and `next build` all still pass cleanly.

**Dependency vulnerability scan** (section 5's requirement):

- **Frontend** (`npm audit`): 3 vulnerabilities (1 moderate, 2 high) —
  `postcss <8.5.10` (GHSA-qx2v-qp2m-jg93, XSS via unescaped `</style>` in
  stringified output) and `sharp <0.35.0` (GHSA-f88m-g3jw-g9cj, inherited
  libvips CVEs), both transitive dependencies bundled inside `next` itself
  (image optimization/CSS tooling), not directly used by this app's code.
  `npm audit fix --force`'s suggested fix downgrades `next` to `9.3.3` — a
  six-year-old major-version regression that would break this entire
  App-Router codebase — so that was **not applied**. Unresolved as of this
  pass; the real fix is waiting for upstream Next.js to bump its bundled
  `postcss`/`sharp` versions, or moving off Next's built-in image
  optimization if that's the actual code path pulling in the vulnerable
  `sharp`.
- **Backend** (`go list -m all` / `govulncheck`): **could not be run in
  this sandbox** — both require resolving `golang.org/x/*` vanity import
  paths, and `golang.org` isn't in this environment's network allowlist
  (only `pypi.org`, `npmjs.org`, `github.com`, etc. are reachable). The
  dependency tree itself is small and explicit in `go.mod`: `fiber
  v2.52.14`, `golang-jwt/jwt/v5 v5.3.1`, `joho/godotenv v1.5.1`, plus a
  handful of fiber's own indirect deps and one `golang.org/x/sys`
  (replaced with the `github.com/golang/sys` mirror to work around this
  same allowlist restriction). Before a real deployment, run `go install
  golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./...` from an
  environment with normal internet access.

**Final review against sections 5/6/9:**

- *Section 5 (security baseline):* RLS is in place and policy-gated on
  every table added across all five phases (verified by re-reading each
  migration's `enable row level security` + policy pairs — see 003-008);
  MFA for admin/teacher (004); rate limiting on login/webhook/public routes
  (main.go, router.go); every new handler validates its input in Go before
  touching the database (this codebase's equivalent of the brief's Zod
  requirement — an already-documented architecture deviation, not new to
  this pass); secrets stay in `backend/.env`, never in a client bundle;
  Helmet-based security headers + a locked-down CSP on the API (main.go);
  Razorpay webhook signature verification (from the original build);
  audit logging on admin-relevant writes across all phases (fee changes,
  SOS raise/resolve, exam results, documents, peer-relationship review).
  Backups/CDN are platform-level and documented as such, unchanged from
  the original pass.
- *Section 6 (UI):* new screens across all four phases reuse the existing
  design tokens (`bg-paper-raised`, `border-line`, `font-serif` headings,
  role accent colors) rather than introducing new ad hoc styles, so there's
  no visual drift from the original system. The Invisible Parent daily
  summary stayed a single quiet paragraph even while gaining Parent
  Personality actions (Listen/detail toggle) — deliberately not turned
  into a dashboard, and the e2e spec now actually asserts no chart/canvas
  renders inside it. Mobile-first layouts were preserved (grid/flex
  wrapping, no fixed-width new components).
- *Section 9 (definition of done):* every box is now checked with one
  documented exception apiece: the e2e suite exists but hasn't been run
  against a live instance (network/credentials constraint, see above), and
  the Go dependency scan couldn't be run in this sandbox for the same
  reason. Both are called out explicitly here rather than left silent.

## Integration stubs (need real credentials to go live)

- **Razorpay** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
  in `backend/.env`): the order-creation call (`POST /api/fees/razorpay/order`)
  and webhook handler (`POST /api/webhooks/razorpay`, with real HMAC-SHA256
  signature verification) are fully implemented against Razorpay's actual
  API. Without keys set, the order endpoint returns a clear 501 rather than
  pretending to succeed. Untested against a live Razorpay account — do a real
  test-mode payment before trusting it in production.
- **LLM daily summaries & School Memory search** (`GEMINI_API_KEY` in
  `backend/.env`, get a free key at https://aistudio.google.com/apikey —
  no credit card, permanent free tier on `gemini-2.5-flash` as of this
  writing): without it, both features use rule-based logic (fully working,
  no credentials needed). With it, both run a **two-pass "draft, then
  self-review" flow** — Gemini drafts an answer, then a second Gemini call
  reviews that draft against the original source data/query and either
  approves it or corrects it, before it's returned. This was originally
  asked for as two independent models (Gemini + Grok) debating before
  answering; Grok's API has no reliable free tier (confirmed via web
  search — xAI's own docs say no permanent free tier is guaranteed, you
  load a paid account with credits), so this uses Gemini alone in both
  roles instead. That's a real, working self-consistency check — it does
  catch a draft that invents something the source data doesn't support —
  but it's honestly one model checking its own work, not two models with
  independent perspectives debating, and it shouldn't be described as the
  latter. If a genuine second model is wanted later, `callGemini` in
  `insight.go` is written as a narrow, swappable helper (prompt in,
  string out) specifically so a second provider's equivalent function can
  sit next to it and slot into the same two-pass flow. Neither path sends
  anything to a client that wasn't already in the database.
- **GPS feed**: there's no real GPS hardware/driver app talking to this.
  `POST /api/driver/location` is a real, working endpoint — a driver's phone
  (or a test script) posting `{busId, lat, lng}` to it will show up live on
  the parent's map via SSE. It's just not wired to an actual bus right now.
- **Document file storage**: see "Phase 1" section above — metadata only,
  no bucket wired up yet.

## What's real and working right now (no credentials needed)

- Fees: admin can create fee line items, parent/student can view status and
  payment history.
- Notices: audience-targeted (school/class/role) broadcast, reusing the
  existing announcements table + new `audience` columns.
- Leave requests: student apply, teacher approve/deny.
- Bus tracking: routes/buses/route-assignment CRUD, boarding events, live
  location via Server-Sent Events (see below).
- Daily summary (Invisible Parent) and Silent Student Flags: real logic
  over real attendance/homework/wellness data, cached with the source data
  that produced them for auditability.
- Knowledge Journey (mastery %) and One Inbox: also real, computed from
  existing grades/homework/notices/gatepass/leave data.
- Timetable, Exams/Results, Document repository (Phase 1, above): all real,
  reads/writes real Supabase tables through real RLS-scoped queries.

No security measure here, or anywhere, guarantees invulnerability — this is
a reasonable baseline for a school-internal tool, not a claim of being
unhackable.

## Security hardening pass (post-Phase-5 addendum)

A deployment-readiness pass against a generic production security checklist.
Most items were already in place from the phases above (RLS, MFA, rate
limiting, Helmet/CSP, input validation, audit logging, secrets via `.env`)
— this pass fixed the genuine gaps found on re-review, and left
infrastructure-only items (WAF, firewall, TLS termination, backup
scheduling, uptime/log monitoring) documented rather than faked, since
those are hosting-platform configuration, not application code:

- **CORS origin was hardcoded to `http://localhost:3001`** in `main.go` —
  meaning a real deploy would either keep silently allowing only localhost
  or need a code change (not a config change) to fix. Now reads
  `FRONTEND_ORIGIN` from the environment, defaulting to the old localhost
  value for local dev. Same fix on the frontend side: `next.config.ts`'s
  CSP `connect-src` now derives from `NEXT_PUBLIC_API_URL` instead of a
  hardcoded API origin.
- **`/admin/seed` had no auth check at all** — only rate-limited, so
  anyone who found the route could reseed/overwrite demo data. Now
  admin-gated like `/debug/profile` already was.
- **Both dev-only routes (`/admin/seed`, `/debug/profile`) now hard-disable
  (404) when `APP_ENV=production`**, rather than relying solely on auth +
  rate limiting to keep them out of a live deployment.
- **`SESSION_SECRET` is now length-checked (≥32 chars) when
  `APP_ENV=production`**, so a weak/placeholder secret fails fast at
  startup instead of quietly signing sessions with something guessable.
- **Added a root `.gitignore`** — there wasn't one. Excludes `.env*` (real
  env files, keeping only `.example` ones), `node_modules`, `.next`,
  build artifacts.
- **Not code-level, documented instead of implemented:**
  - *HTTPS*: terminate TLS at the hosting platform/load balancer (Vercel,
    Render, Fly.io, etc. all do this for you); this app doesn't manage
    certificates itself.
  - *WAF / firewall*: put a CDN/edge network in front of the API (the
    existing rate limiter is app-level, not a substitute — see main.go's
    comment on this).
  - *Backups*: Supabase Postgres backup scheduling is a project-settings
    toggle, not application code — enable point-in-time recovery or daily
    backups in the Supabase dashboard.
  - *Monitoring/logging*: `audit_logs` covers admin-relevant application
    events; infrastructure-level uptime/error monitoring (Sentry, a
    platform's built-in log drain, etc.) is a hosting-side integration,
    not something this codebase can self-provide.
  - *Dependency updates*: see the vulnerability-scan note earlier in this
    file — one known transitive frontend issue (bundled inside `next`,
    no safe fix available upstream yet) and an un-runnable Go scan in this
    sandbox; run `govulncheck ./...` and `npm audit` with real network
    access before a production deploy.

## Architecture deviations from the original EduSync brief

- **RLS is now the real enforcement point, not just an inert second layer.**
  Every handler except three documented exceptions (the dev-only seed
  script, `AdminListUsers`/GoTrue admin calls, and the Razorpay webhook —
  which has no logged-in user, verified by HMAC signature instead) now
  queries Supabase via `Deps.UserDB(c)`, which forwards the logged-in
  user's own Supabase access token instead of the service-role key. See
  `internal/supabase/client.go`'s `WithUserToken` and
  `internal/handlers/auth.go`'s `UserDB`. The login flow was previously
  discarding the real GoTrue-issued JWT and replacing it with an app-only
  token that PostgREST had never seen — that's the bug this fixes.
  `backend/migrations/003_rls_policies.sql` also had missing write
  policies (attendance/grades/submissions staff-writes, daily_summaries
  insert, chats insert) that would have silently blocked legitimate
  teacher actions once RLS became real; those are added now. **Still not
  done:** actually testing this against a live Supabase project (no
  credentials in this environment) — the migration file has a starting
  `curl` script for verifying cross-tenant reads fail; run it before
  trusting this in production.
- Along the way, found and fixed a real bug: `/debug/profile` had **no
  auth check at all** and would dump every user/profile to anyone who hit
  the URL. Now gated to admin and audit-logged as a data export.
- **Live bus location uses Server-Sent Events, not Supabase Realtime
  channels.** One-way push from server to client, polls the DB every 3s
  server-side. Good enough for "watch the bus move," not a general realtime
  pub/sub system.
- **MFA**: implemented via Supabase GoTrue's native TOTP factor API
  (`/auth/v1/factors`), not custom crypto. Admin and teacher accounts must
  enroll on first login (`POST /auth/mfa/enroll` → `/auth/mfa/enroll/confirm`)
  and complete a TOTP challenge on every subsequent login
  (`POST /auth/mfa/verify`) before `RequireAuth` lets them past login into
  any other route — see `RoleRequiresMFA`/`MFAVerified` in
  `internal/middleware/auth.go`. One documented exception: flipping
  `profiles.mfa_enrolled` after a successful enrollment uses the
  service-role client rather than a general "update your own profile" RLS
  policy, since the latter would need column-level restriction (a trigger)
  to stop a user editing their own `role` — out of scope this pass, so the
  Go handler is the thing narrowly trusted here, exactly like the seed
  script. Password policy itself still comes from Supabase Auth defaults
  (not hardened further); session expiry/refresh is handled via the real
  GoTrue access/refresh token pair now (~1h access token, auto-refreshed).
- **Audit logging**: `audit_logs` table (migration 004) + `Deps.Audit()`
  helper, wired into fee creation, gatepass approval/denial, leave
  approval/denial, the Razorpay webhook's payment-captured event (system
  actor, since there's no user session), MFA enrollment, and the
  `/debug/profile` data export. Append-only — no update/delete RLS policy
  exists for the table. **Not yet wired**: grade overrides (there's
  currently no admin/teacher endpoint that writes to `grades` at all
  outside the seed script — see Phase A gaps below) and role changes
  (no endpoint to change a user's role exists yet either).
- **What's now actually in place:** rate limiting (global + strict on
  `/auth/login`, `/admin/seed`, `/auth/mfa/*`, and the Razorpay webhook, via
  Fiber's in-memory limiter — not Redis-backed, so it resets per-instance
  and won't coordinate across multiple backend replicas), security headers
  on both the Go API (`helmet` middleware, locked-down CSP since it's
  API-only) and the Next.js app (`next.config.ts`, real CSP allowing only
  Razorpay + MapLibre's tile sources), and input validation on every new
  handler (required-field checks before touching the database — not full
  Zod-style schema validation, since this is Go, but the same principle:
  never trust the payload as-is).
- **All 5 phases are now complete** (see the roadmap below for what each
  added). The only two open items, both documented in the Phase 5 section
  above rather than silently skipped: the Playwright e2e suite exists but
  hasn't been run against a live instance, and the Go dependency scan
  couldn't be run in this sandbox's network environment.

## 5-phase roadmap

1. **Phase 1 (done):** Tier 1 completion — timetable, exams/results,
   document repository.
2. **Phase 2 (done, this pass):** Tier 2 completion — geofence-triggered
   notifications (arrived/departed/delay/breakdown), ETA calculation,
   route stops, driver app view, SOS alerts.
3. **Phase 3 (done):** Phase C batch 1 — Classroom Energy,
   Friendship Intelligence, School Memory.
4. **Phase 4 (done):** Phase C batch 2 — AI School Simulator,
   Parent Personality, AI Meeting Prep.
5. **Phase 5 (done, this pass):** Vitest/Playwright test suite, dependency
   vulnerability scan, final security/UI review against sections 5/6/9,
   NOTES.md finalized.

All five phases are now complete. The two open items are both documented
above rather than silently skipped: the Playwright suite hasn't been run
against a live instance (needs a real Supabase project + browser
binaries), and the Go dependency scan couldn't be run in this sandbox
(needs `golang.org` network access this environment doesn't allow).

## Known simplifications

- `SilentStudentFlags` only checks class "10A" (matches the rest of this
  codebase's hardcoded single-class scope from the original app — see the
  teacher dashboard, which has the same limitation). `ClassEnergyInsights`
  and `GenerateFriendshipSuggestions` default to "10A" the same way when no
  `class` query param is given.
- `ListPeerRelationships`'s `class` query param is accepted but not yet
  applied as a filter (would need a join through students) — it currently
  returns all classes' suggestions together. Fine for a single-class demo,
  a real gap for a multi-class deployment.
- Fee amounts are stored/sent as decimal rupees and converted to paise only
  at the Razorpay call site.
- No dependency vulnerability scan was run in this pass (`go list -m all` /
  `npm audit` should be run before any real deployment).
