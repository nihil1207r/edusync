-- Phase 3 (AI Insight Layer batch 1): Classroom Energy, Friendship
-- Intelligence, School Memory. Additive only — run after 001-006.
--
-- Per section 7 of the brief, these are teacher-logged/activity-based
-- signals — never camera, biometric, or social-media-style tracking.

-- ── Engagement logs (per-student, per-session teacher signal) ──────────
-- The brief's engagement_logs table: one-tap-per-class ratings a teacher
-- enters, not anything automatically sensed. This is the primary evidence
-- source for Friendship Intelligence and feeds into Silent Student
-- Detector alongside the existing homework/wellness signals.
create table if not exists engagement_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class text not null,
  session_date date not null default current_date,
  participation int check (participation between 1 and 5),
  confidence int check (confidence between 1 and 5),
  curiosity int check (curiosity between 1 and 5),
  notes text,
  logged_by text,
  created_at timestamptz not null default now()
);
create index if not exists engagement_logs_student_idx on engagement_logs (student_id, session_date desc);

alter table engagement_logs enable row level security;

create policy "engagement_logs: staff read/write" on engagement_logs
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "engagement_logs: family reads own child" on engagement_logs
  for select using (student_id = (select child_id from auth_profile()));
create policy "engagement_logs: staff insert" on engagement_logs
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── Classroom Energy (per-class aggregate teacher signal) ───────────────
create table if not exists class_energy_logs (
  id uuid primary key default gen_random_uuid(),
  class text not null,
  period int,
  session_date date not null default current_date,
  engagement_score int not null check (engagement_score between 1 and 5),
  notes text,
  logged_by text,
  created_at timestamptz not null default now()
);
create index if not exists class_energy_logs_class_idx on class_energy_logs (class, session_date desc);

alter table class_energy_logs enable row level security;

-- Staff-only: this is classroom-operational data, not a specific child's
-- record, so it isn't exposed on the family side the way engagement_logs is.
create policy "class_energy_logs: staff read/write" on class_energy_logs
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "class_energy_logs: staff insert" on class_energy_logs
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── Friendship Intelligence ──────────────────────────────────────────
-- System-suggested rows (status='suggested') come from simple, disclosed
-- statistics over engagement_logs (see friendship.go) — never an automated
-- action, always requires a teacher to accept/reject. Teacher-asserted rows
-- (evidence_source='teacher-reported') are inserted pre-accepted since the
-- teacher stated them directly rather than the system inferring them.
create table if not exists peer_relationships (
  id uuid primary key default gen_random_uuid(),
  student_a_id uuid not null references students(id) on delete cascade,
  student_b_id uuid references students(id) on delete cascade, -- null for a single-student flag like isolation_risk
  relationship_type text not null check (
    relationship_type in ('explains_well','motivates','isolation_risk','suggested_seating')
  ),
  confidence_score numeric(3,2),
  evidence_source text,
  status text not null default 'suggested' check (status in ('suggested','accepted','rejected')),
  created_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz
);

alter table peer_relationships enable row level security;

-- Staff-only, by design — this is inference about relationships between
-- children, not a single family's own data, so it's never exposed to
-- parents/students at all, only to the teacher who can accept/reject it.
create policy "peer_relationships: staff only" on peer_relationships
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "peer_relationships: staff insert" on peer_relationships
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "peer_relationships: staff update" on peer_relationships
  for update using ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── School Memory ────────────────────────────────────────────────────
-- Populated two ways: (1) automatically, from real events this app already
-- records (exam results, shared certificates — see exams.go/documents.go),
-- and (2) manually, for things this app has no dedicated tracking for yet
-- (e.g. "robotics club since Class 6") via a teacher/admin entry form.
-- Nothing in this table is invented — every row traces to source_table/
-- source_id when it was auto-generated, or to logged_by when manual.
create table if not exists school_events_index (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  event_type text not null, -- 'exam' | 'certificate' | 'extracurricular' | 'achievement' | 'other'
  description text not null,
  event_date date not null default current_date,
  source_table text,
  source_id uuid,
  logged_by text,
  created_at timestamptz not null default now()
);
create index if not exists school_events_index_student_idx on school_events_index (student_id, event_date desc);

alter table school_events_index enable row level security;

create policy "school_events_index: staff read all" on school_events_index
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "school_events_index: family reads own child" on school_events_index
  for select using (student_id = (select child_id from auth_profile()));
create policy "school_events_index: staff insert" on school_events_index
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── Verification ─────────────────────────────────────────────────────
-- A parent must never be able to read peer_relationships or another
-- family's engagement_logs/school_events_index — same cross-tenant test
-- pattern as 003/005:
--   curl "$SUPABASE_URL/rest/v1/peer_relationships?select=*" \
--     -H "Authorization: Bearer $PARENT_TOKEN" -H "apikey: $ANON_KEY"
-- should return an empty array (not an error — RLS just yields no rows).
