-- Phase 1 (Tier 1 completion): Timetable, Exams/Results, Document Repository.
-- Additive only — run after 001/002/003/004. RLS is enabled and policy-gated
-- immediately, following the same pattern as 003 (no table ships open).

-- ── Timetable ────────────────────────────────────────────────────────
create table if not exists timetable_slots (
  id uuid primary key default gen_random_uuid(),
  class text not null,                          -- e.g. "10A" — matches students.class / profiles.class
  day_of_week int not null check (day_of_week between 1 and 6), -- 1=Mon .. 6=Sat
  period int not null check (period between 1 and 10),
  subject text not null,
  teacher_name text,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  unique (class, day_of_week, period)
);

alter table timetable_slots enable row level security;

create policy "timetable: everyone logged in reads" on timetable_slots
  for select using (auth.role() = 'authenticated');

create policy "timetable: staff write" on timetable_slots
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "timetable: staff update" on timetable_slots
  for update using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "timetable: staff delete" on timetable_slots
  for delete using ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── Exams (schedule) ─────────────────────────────────────────────────
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  class text not null,
  subject text not null,
  exam_date date not null,
  max_marks numeric(6,2) not null default 100,
  term text,
  created_at timestamptz not null default now()
);

alter table exams enable row level security;

create policy "exams: everyone logged in reads" on exams
  for select using (auth.role() = 'authenticated');

create policy "exams: staff write" on exams
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "exams: staff update" on exams
  for update using ((select role from auth_profile()) in ('teacher', 'admin'));

-- `grades` already exists (pre-002 schema) with (student_id, subject, marks,
-- total, grade). Link results to a specific exam without breaking the
-- existing seed-script rows (which have no exam).
alter table grades add column if not exists exam_id uuid references exams(id) on delete set null;

-- Needed for the teacher grade-entry upsert (ON CONFLICT student_id,subject,exam_id).
-- Existing seed-script rows have exam_id = null, and Postgres treats each null
-- as distinct for uniqueness purposes, so this doesn't collide with them.
create unique index if not exists grades_student_subject_exam_uidx
  on grades (student_id, subject, exam_id);

-- ── Document repository ──────────────────────────────────────────────
-- Metadata only in this pass. Actual file bytes are NOT stored by this app —
-- `file_url` points at wherever the file actually lives (a Supabase Storage
-- bucket once one is provisioned with real credentials). See NOTES.md: this
-- is the same "stub the integration boundary, don't fake the surrounding
-- data" pattern used for Razorpay/GPS.
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade, -- null = class-wide or school-wide
  class text,                                                -- null + student_id null = school-wide
  title text not null,
  category text not null default 'other'
    check (category in ('report_card','id_card','certificate','circular','other')),
  file_url text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

alter table documents enable row level security;

create policy "documents: staff read all" on documents
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "documents: family reads own or school/class-wide" on documents
  for select using (
    student_id = (select child_id from auth_profile())
    or (student_id is null and class is null)
    or (student_id is null and class = (select c.class from students c where c.id = (select child_id from auth_profile())))
  );

create policy "documents: staff write" on documents
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "documents: staff delete" on documents
  for delete using ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── Verification (run manually against a live project, same as 003) ────
-- A parent should NOT be able to read another family's documents or another
-- class's grades:
--   curl "$SUPABASE_URL/rest/v1/documents?select=*" \
--     -H "Authorization: Bearer $PARENT_A_TOKEN" -H "apikey: $ANON_KEY"
-- should only ever return rows where student_id = parent A's own child,
-- or class/school-wide rows.
