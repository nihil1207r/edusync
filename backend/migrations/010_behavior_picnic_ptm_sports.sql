-- Phase 6 (hackathon feature pass): Social Behavior tracking, Picnic
-- activities/plans, Parent-Teacher Meeting (PTM) scheduling, and Sports
-- activities. Additive only — run after 001-009. Same RLS pattern as 005/006
-- (auth_profile() helper, staff-write / family-read).

-- ── Social behavior logs (teacher-entered, student/parent read own) ─────
create table if not exists student_behavior_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class text not null,
  category text not null default 'neutral'
    check (category in ('positive', 'neutral', 'needs_attention', 'incident')),
  note text not null,
  rating int check (rating between 1 and 5),
  logged_by text,                         -- teacher's display name
  created_at timestamptz not null default now()
);

alter table student_behavior_logs enable row level security;

create policy "behavior: staff read all" on student_behavior_logs
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "behavior: family reads own child" on student_behavior_logs
  for select using (student_id = (select child_id from auth_profile()));

create policy "behavior: staff write" on student_behavior_logs
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

create index if not exists idx_behavior_student on student_behavior_logs(student_id);
create index if not exists idx_behavior_class on student_behavior_logs(class);

-- ── Picnics / trips (teacher plans, student requests, parent consents) ──
create table if not exists picnics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  class text not null,                    -- e.g. "8B" — which class this picnic is for
  location text,
  event_date date not null,
  cost numeric(8,2) not null default 0,
  max_students int,
  status text not null default 'planned'
    check (status in ('planned', 'confirmed', 'cancelled', 'completed')),
  created_by text,
  created_at timestamptz not null default now()
);

alter table picnics enable row level security;

create policy "picnics: everyone logged in reads" on picnics
  for select using (auth.role() = 'authenticated');

create policy "picnics: staff write" on picnics
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "picnics: staff update" on picnics
  for update using ((select role from auth_profile()) in ('teacher', 'admin'));

create index if not exists idx_picnics_class on picnics(class);

create table if not exists picnic_requests (
  id uuid primary key default gen_random_uuid(),
  picnic_id uuid not null references picnics(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  parent_consent boolean not null default false,   -- set true by the "picnic form" the parent submits
  parent_note text,
  created_at timestamptz not null default now(),
  unique (picnic_id, student_id)
);

alter table picnic_requests enable row level security;

create policy "picnic_requests: staff read all" on picnic_requests
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "picnic_requests: family reads/writes own child" on picnic_requests
  for select using (student_id = (select child_id from auth_profile()));

create policy "picnic_requests: student creates own request" on picnic_requests
  for insert with check (student_id = (select child_id from auth_profile())
    or (select role from auth_profile()) in ('teacher', 'admin'));

create policy "picnic_requests: family/staff update" on picnic_requests
  for update using (
    student_id = (select child_id from auth_profile())
    or (select role from auth_profile()) in ('teacher', 'admin')
  );

create index if not exists idx_picnic_requests_student on picnic_requests(student_id);

-- ── Parent-Teacher Meeting (PTM) schedule ───────────────────────────────
create table if not exists ptm_schedules (
  id uuid primary key default gen_random_uuid(),
  class text not null,
  teacher_name text,
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  location text,
  agenda text,
  created_at timestamptz not null default now()
);

alter table ptm_schedules enable row level security;

create policy "ptm: everyone logged in reads" on ptm_schedules
  for select using (auth.role() = 'authenticated');

create policy "ptm: staff write" on ptm_schedules
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

create index if not exists idx_ptm_schedules_class on ptm_schedules(class);

create table if not exists ptm_bookings (
  id uuid primary key default gen_random_uuid(),
  ptm_id uuid not null references ptm_schedules(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  slot_time time,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (ptm_id, student_id)
);

alter table ptm_bookings enable row level security;

create policy "ptm_bookings: staff read all" on ptm_bookings
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "ptm_bookings: family reads own child" on ptm_bookings
  for select using (student_id = (select child_id from auth_profile()));

create policy "ptm_bookings: family books own child" on ptm_bookings
  for insert with check (student_id = (select child_id from auth_profile()));

create index if not exists idx_ptm_bookings_student on ptm_bookings(student_id);

-- ── Sports activities (teacher/admin plans, student signs up) ──────────
create table if not exists sports_activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  class text,                             -- null = open to whole school
  category text,                          -- e.g. "cricket", "athletics"
  schedule_date date,
  coach_name text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table sports_activities enable row level security;

create policy "sports: everyone logged in reads" on sports_activities
  for select using (auth.role() = 'authenticated');

create policy "sports: staff write" on sports_activities
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

create index if not exists idx_sports_activities_class on sports_activities(class);

create table if not exists sports_signups (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references sports_activities(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (activity_id, student_id)
);

alter table sports_signups enable row level security;

create policy "sports_signups: staff read all" on sports_signups
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "sports_signups: family reads own child" on sports_signups
  for select using (student_id = (select child_id from auth_profile()));

create policy "sports_signups: student signs up own child" on sports_signups
  for insert with check (student_id = (select child_id from auth_profile()));

create index if not exists idx_sports_signups_student on sports_signups(student_id);

-- ── Verification (same pattern as 005/006 — run manually against a live project) ────
-- A parent should only ever see behavior logs / picnic requests / ptm
-- bookings / sports signups for their own linked child, never another
-- family's rows; teachers/admins see the full class.

-- ── Supporting indexes (student/class lookups happen on every dashboard load) ──
create index if not exists idx_picnics_class on picnics(class);
create index if not exists idx_picnic_requests_student on picnic_requests(student_id);
create index if not exists idx_ptm_schedules_class on ptm_schedules(class);
create index if not exists idx_ptm_bookings_student on ptm_bookings(student_id);
create index if not exists idx_sports_activities_class on sports_activities(class);
create index if not exists idx_sports_signups_student on sports_signups(student_id);
