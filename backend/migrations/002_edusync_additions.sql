-- EduNexus v2 additions — run this against your Supabase project's SQL editor
-- or via `supabase db push` if you're using the CLI. Additive only; nothing
-- here touches existing tables' data.

-- ── Fees ─────────────────────────────────────────────────────────────
create table if not exists fees (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  term text not null,
  amount numeric(10,2) not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid','overdue')),
  created_at timestamptz not null default now()
);

create table if not exists fee_payments (
  id uuid primary key default gen_random_uuid(),
  fee_id uuid not null references fees(id) on delete cascade,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  amount numeric(10,2) not null,
  method text,
  verified boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Notices (extends existing `announcements` rather than duplicating it) ──
alter table announcements add column if not exists audience text not null default 'school'
  check (audience in ('school','class','role'));
alter table announcements add column if not exists audience_value text;

-- ── Leave requests ───────────────────────────────────────────────────
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  approved_by text,
  created_at timestamptz not null default now()
);

-- ── Bus tracking ─────────────────────────────────────────────────────
create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stops jsonb not null default '[]' -- [{ "name": "...", "lat": 0, "lng": 0 }]
);

create table if not exists buses (
  id uuid primary key default gen_random_uuid(),
  number_plate text not null,
  driver_name text not null,
  route_id uuid references routes(id) on delete set null
);

create table if not exists route_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  route_id uuid not null references routes(id) on delete cascade,
  stop_index int not null default 0
);

-- Latest known location per bus. One row per bus, upserted on every ping.
create table if not exists bus_locations (
  bus_id uuid primary key references buses(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

create table if not exists boarding_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  bus_id uuid not null references buses(id) on delete cascade,
  event text not null check (event in ('boarded','alighted')),
  created_at timestamptz not null default now()
);

-- ── AI Insight Layer (Phase C, minimal slice: Invisible Parent) ────────
-- Cached daily summaries, one per student per day, with the source data
-- that produced them logged alongside for auditability.
create table if not exists daily_summaries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  summary_date date not null,
  summary text not null,
  source_data jsonb not null,
  generated_by text not null default 'rules', -- 'rules' or 'llm'
  generated_at timestamptz not null default now(),
  unique (student_id, summary_date)
);

-- Indexes for the lookups the handlers do most often.
create index if not exists idx_fees_student on fees(student_id);
create index if not exists idx_leave_student on leave_requests(student_id);
create index if not exists idx_route_assignments_student on route_assignments(student_id);
create index if not exists idx_boarding_events_student on boarding_events(student_id);
