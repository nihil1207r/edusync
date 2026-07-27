-- EduNexus — base schema (001).
--
-- This reconstructs the schema the original app pass assumed already
-- existed — migrations 002 through 008 are all additive on top of this
-- and will fail on a brand-new Supabase project without it. Every table,
-- column, and constraint below was reverse-engineered directly from what
-- the Go backend and Next.js frontend actually read/write (grep'd across
-- internal/handlers/*.go and scripts/seed.ts-equivalent d.DB.Upsert calls)
-- — not from the original aspirational brief's schema sketch, which this
-- codebase deviated from in a few places (e.g. `class` is a plain text
-- column here, not a foreign key to a separate `classes` table).
--
-- Run this FIRST, before 002-008, against a fresh Supabase project's SQL
-- editor (or `supabase db push`). Safe to run once against an empty
-- database. RLS is deliberately NOT enabled here — that's what 003 does,
-- run immediately after 002.
--
-- After this + 002-008, you still need to:
--   1. Create the demo auth users in Supabase Auth (dashboard → Authentication
--      → Users → Add user) with these exact emails — the seed script matches
--      profiles to auth users by email, it doesn't create auth users itself:
--        admin@edunexus.com / priya@edunexus.com / arjun@edunexus.com /
--        rahul@edunexus.com  (any password you like at creation time; the
--        password checked at login is whatever you set here)
--   2. POST /admin/seed with {"password":"admin123"} to populate profiles,
--      students, grades, attendance, homework, wellness, and a sample chat.

create extension if not exists pgcrypto;

-- ── profiles ─────────────────────────────────────────────────────────
-- One row per Supabase Auth user, keyed to auth.users(id). role drives
-- almost every permission check in this app (RequireAuth, RLS policies).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('student','parent','teacher','admin','driver')),
  class text,           -- set for teacher (their class) and student (their own class)
  subject text,         -- set for teacher
  roll_no text,         -- set for student
  points int not null default 0,
  phone text,
  child_id uuid,         -- set for parent (their child) and student (points at their own row) — FK added below, after `students` exists
  mfa_enrolled boolean not null default false, -- also (re)declared by 004 for anyone running migrations out of order
  created_at timestamptz not null default now()
);

-- ── students ─────────────────────────────────────────────────────────
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class text not null,
  roll_no text not null,
  points int not null default 0,
  badges jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (roll_no, class)
);

alter table profiles add constraint profiles_child_id_fkey
  foreign key (child_id) references students(id) on delete set null;

-- ── attendance ───────────────────────────────────────────────────────
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','absent','late','leave')),
  marked_by text,
  created_at timestamptz not null default now(),
  unique (student_id, date)
);

-- ── grades ───────────────────────────────────────────────────────────
-- exam_id column (linking a grade row to a specific scheduled exam) is
-- added later by 005 — this table predates that and is used standalone
-- for the original app's simple per-subject marks too.
create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject text not null,
  marks numeric(6,2) not null,
  total numeric(6,2) not null default 100,
  grade text not null default '-',
  created_at timestamptz not null default now()
);

-- ── homework / homework_submissions ─────────────────────────────────
create table if not exists homework (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  description text,
  due_date timestamptz not null,
  points int not null default 50,
  by_id uuid,            -- teacher who posted it (references profiles.id, no FK — teacher accounts may predate this table)
  created_at timestamptz not null default now()
);

create table if not exists homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references homework(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted',
  grade text,
  unique (homework_id, student_id)
);

-- ── wellness ─────────────────────────────────────────────────────────
create table if not exists wellness (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  mood int not null check (mood between 1 and 5),
  message text,
  sentiment text not null default 'neutral' check (sentiment in ('positive','neutral','negative')),
  anonymous boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── announcements ────────────────────────────────────────────────────
-- audience / audience_value columns are added later by 002 (notices).
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  by_id uuid,
  by_name text,
  important boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── gatepasses ───────────────────────────────────────────────────────
-- Quirk carried over from the original app: student_id here stores the
-- student's own auth.uid() (their profiles.id), NOT students.id like
-- every other per-student table in this schema — see the RLS policy
-- comment in 003 and PostGatepass in student.go. Not worth "fixing" since
-- it'd mean touching the student-facing gate pass flow for no functional
-- gain.
create table if not exists gatepasses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  student_name text,
  reason text not null,
  exit_time text,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  approved_by text,
  created_at timestamptz not null default now()
);

-- ── chats / messages (teacher ↔ parent) ──────────────────────────────
create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  parent_id uuid not null,
  student_id uuid references students(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (teacher_id, parent_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  from_id uuid not null,
  from_name text,
  text text not null,
  created_at timestamptz not null default now()
);

-- ── Indexes for the lookups the handlers do most often ────────────────
create index if not exists idx_students_class on students(class);
create index if not exists idx_attendance_student on attendance(student_id);
create index if not exists idx_grades_student on grades(student_id);
create index if not exists idx_homework_submissions_student on homework_submissions(student_id);
create index if not exists idx_wellness_student on wellness(student_id);
create index if not exists idx_gatepasses_student on gatepasses(student_id);
create index if not exists idx_messages_chat on messages(chat_id);
