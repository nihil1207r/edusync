-- Phase 4 (AI Insight Layer batch 2): AI School Simulator, Parent
-- Personality, AI Meeting Prep. Additive only — run after 001-007.

-- ── AI School Simulator ──────────────────────────────────────────────
-- Every scenario stores the real baseline statistics it was computed from
-- (assumptions_jsonb) alongside the output (predicted_outcomes_jsonb), so
-- an admin can see exactly what numbers a prediction came from — not a
-- black box. See simulator.go: outputs are always labeled as estimates
-- from a documented heuristic, never a validated forecast.
create table if not exists simulation_scenarios (
  id uuid primary key default gen_random_uuid(),
  created_by text,
  question text not null,
  assumptions_jsonb jsonb not null default '{}',
  predicted_outcomes_jsonb jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table simulation_scenarios enable row level security;

create policy "simulation_scenarios: staff only" on simulation_scenarios
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "simulation_scenarios: staff insert" on simulation_scenarios
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── Parent Personality ───────────────────────────────────────────────
-- message_reads is the actual engagement signal this learns from: which
-- delivery action a parent takes on a notice/summary (expand to detailed,
-- use the browser's built-in text-to-speech to listen, or view a small
-- visual breakdown vs. just reading the concise default). Nothing here
-- infers anything from outside this app.
create table if not exists message_reads (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null,
  message_type text not null, -- 'notice' | 'daily_summary'
  message_id text,
  action text not null check (action in ('concise','detailed','voice','visual')),
  created_at timestamptz not null default now()
);
create index if not exists message_reads_parent_idx on message_reads (parent_id, created_at desc);

alter table message_reads enable row level security;

create policy "message_reads: own only" on message_reads
  for select using (parent_id = auth.uid());
create policy "message_reads: own insert" on message_reads
  for insert with check (parent_id = auth.uid());

create table if not exists parent_communication_prefs (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null unique,
  preferred_format text not null default 'concise' check (preferred_format in ('voice','concise','detailed','visual')),
  learned_confidence numeric(3,2) not null default 0,
  sample_size int not null default 0,
  updated_at timestamptz not null default now()
);

alter table parent_communication_prefs enable row level security;

create policy "parent_communication_prefs: own only" on parent_communication_prefs
  for select using (parent_id = auth.uid());
create policy "parent_communication_prefs: own upsert" on parent_communication_prefs
  for insert with check (parent_id = auth.uid());
create policy "parent_communication_prefs: own update" on parent_communication_prefs
  for update using (parent_id = auth.uid());
-- Staff can also read a family's learned preference, purely so a teacher
-- composing a notice knows how a parent tends to prefer it — never so staff
-- can see the raw read-action log (message_reads stays private to the
-- parent above).
create policy "parent_communication_prefs: staff reads" on parent_communication_prefs
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── AI Meeting Prep ──────────────────────────────────────────────────
create table if not exists meeting_prep_docs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  meeting_date date not null,
  achievements jsonb not null default '[]',
  concerns jsonb not null default '[]',
  suggested_actions jsonb not null default '[]',
  source_data jsonb not null default '{}',
  generated_by text not null default 'rules',
  generated_at timestamptz not null default now()
);
create index if not exists meeting_prep_docs_student_idx on meeting_prep_docs (student_id, meeting_date desc);

alter table meeting_prep_docs enable row level security;

create policy "meeting_prep_docs: staff read/write" on meeting_prep_docs
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "meeting_prep_docs: staff insert" on meeting_prep_docs
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));
-- Parents can see the finished brief for their own child (it's about to be
-- discussed with them, after all) — but not regenerate or edit it.
create policy "meeting_prep_docs: family reads own child" on meeting_prep_docs
  for select using (student_id = (select child_id from auth_profile()));

-- ── Verification ─────────────────────────────────────────────────────
-- A parent must never see another family's meeting_prep_docs, and a
-- teacher/admin must never see a parent's raw message_reads log:
--   curl "$SUPABASE_URL/rest/v1/message_reads?select=*" \
--     -H "Authorization: Bearer $TEACHER_TOKEN" -H "apikey: $ANON_KEY"
-- should return an empty array.
