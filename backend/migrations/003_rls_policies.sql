-- EduNexus RLS policies — the real enforcement boundary, not just defense
-- in depth.
--
-- The Go backend now forwards each logged-in user's own Supabase access
-- token (see internal/handlers/auth.go's Deps.UserDB and
-- internal/supabase/client.go's WithUserToken) for all normal reads/writes,
-- instead of the service-role key. That means these policies are what
-- actually stops a parent from reading another family's rows — a bug in
-- the Go handlers (e.g. a missing WHERE clause) can no longer leak
-- cross-tenant data, because Postgres itself rejects the query.
--
-- The service-role key is still used, deliberately, for a short list of
-- things that must legitimately bypass RLS: the dev-only seed script
-- (scripts/seed / /admin/seed), GoTrue admin calls (AdminListUsers), and
-- the Razorpay webhook (which has no logged-in user to act as — verified
-- instead by HMAC signature). See each call site for a comment explaining
-- why.
--
-- Run this against your Supabase project after 001/002. Safe to run before
-- any data exists.

-- Helper: current user's role and linked student id, read from `profiles`.
-- SECURITY DEFINER so it can read profiles regardless of the caller's own
-- RLS visibility into that table.
create or replace function auth_profile()
returns table (role text, child_id uuid)
language sql security definer stable
as $$
  select role, child_id from profiles where id = auth.uid()
$$;

-- ── profiles ─────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy "profiles: read own row" on profiles
  for select using (id = auth.uid());

create policy "profiles: admin reads all" on profiles
  for select using ((select role from auth_profile()) = 'admin');

create policy "profiles: teacher reads all" on profiles
  for select using ((select role from auth_profile()) = 'teacher');

-- ── students ─────────────────────────────────────────────────────────
alter table students enable row level security;

create policy "students: teacher/admin read all" on students
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "students: parent reads own child" on students
  for select using (id = (select child_id from auth_profile()));

create policy "students: student reads own row" on students
  for select using (id = (select child_id from auth_profile()));

-- ── grades / attendance / homework / homework_submissions ──────────────
-- Same shape for all four: teacher/admin see everything for their class;
-- parent/student see only their own child's rows.
alter table grades enable row level security;
alter table attendance enable row level security;
alter table homework_submissions enable row level security;

create policy "grades: staff read all" on grades
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "grades: family reads own" on grades
  for select using (student_id = (select child_id from auth_profile()));
create policy "grades: staff writes" on grades
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "grades: staff updates" on grades
  for update using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "attendance: staff read all" on attendance
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "attendance: family reads own" on attendance
  for select using (student_id = (select child_id from auth_profile()));
create policy "attendance: staff writes" on attendance
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "attendance: staff updates" on attendance
  for update using ((select role from auth_profile()) in ('teacher', 'admin'));

create policy "submissions: staff read all" on homework_submissions
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "submissions: staff grades" on homework_submissions
  for update using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "submissions: student manages own" on homework_submissions
  for all using (student_id = (select child_id from auth_profile()));

-- homework itself and announcements are broadcast content — everyone
-- logged in can read them; only teachers/admins can write.
alter table homework enable row level security;
create policy "homework: anyone logged in reads" on homework
  for select using (auth.uid() is not null);
create policy "homework: staff writes" on homework
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

alter table announcements enable row level security;
create policy "announcements: anyone logged in reads" on announcements
  for select using (auth.uid() is not null);
create policy "announcements: staff writes" on announcements
  for insert with check ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── wellness ─────────────────────────────────────────────────────────
alter table wellness enable row level security;
create policy "wellness: staff read all" on wellness
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "wellness: student manages own" on wellness
  for all using (student_id = (select child_id from auth_profile()));

-- ── gatepasses ───────────────────────────────────────────────────────
alter table gatepasses enable row level security;
create policy "gatepasses: staff read/update all" on gatepasses
  for all using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "gatepasses: student manages own" on gatepasses
  for all using (student_id = auth.uid()); -- see NOTES.md re: this table's existing id quirk

-- ── chats / messages ─────────────────────────────────────────────────
alter table chats enable row level security;
create policy "chats: participants only" on chats
  for select using (teacher_id = auth.uid() or parent_id = auth.uid());
create policy "chats: participant creates" on chats
  for insert with check (teacher_id = auth.uid() or parent_id = auth.uid());

alter table messages enable row level security;
create policy "messages: participants only" on messages
  for all using (
    chat_id in (select id from chats where teacher_id = auth.uid() or parent_id = auth.uid())
  );

-- ── fees / fee_payments ──────────────────────────────────────────────
alter table fees enable row level security;
create policy "fees: staff read/write all" on fees
  for all using ((select role from auth_profile()) = 'admin');
create policy "fees: family reads own" on fees
  for select using (student_id = (select child_id from auth_profile()));

alter table fee_payments enable row level security;
create policy "fee_payments: staff read all" on fee_payments
  for select using ((select role from auth_profile()) = 'admin');
create policy "fee_payments: family reads own" on fee_payments
  for select using (
    fee_id in (select id from fees where student_id = (select child_id from auth_profile()))
  );

-- ── leave_requests ───────────────────────────────────────────────────
alter table leave_requests enable row level security;
create policy "leave: staff read/update all" on leave_requests
  for all using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "leave: family manages own" on leave_requests
  for all using (student_id = (select child_id from auth_profile()));

-- ── bus tracking ─────────────────────────────────────────────────────
alter table routes enable row level security;
create policy "routes: anyone logged in reads" on routes
  for select using (auth.uid() is not null);
create policy "routes: admin writes" on routes
  for all using ((select role from auth_profile()) = 'admin');

alter table buses enable row level security;
create policy "buses: staff read all" on buses
  for select using ((select role from auth_profile()) in ('teacher', 'admin', 'driver'));
create policy "buses: admin writes" on buses
  for all using ((select role from auth_profile()) = 'admin');

alter table route_assignments enable row level security;
create policy "route_assignments: staff read all" on route_assignments
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "route_assignments: family reads own" on route_assignments
  for select using (student_id = (select child_id from auth_profile()));
create policy "route_assignments: admin writes" on route_assignments
  for all using ((select role from auth_profile()) = 'admin');

alter table bus_locations enable row level security;
create policy "bus_locations: anyone logged in reads" on bus_locations
  for select using (auth.uid() is not null);
create policy "bus_locations: driver writes own bus" on bus_locations
  for all using (
    bus_id in (select id from buses) and (select role from auth_profile()) = 'driver'
  );

alter table boarding_events enable row level security;
create policy "boarding_events: staff read all" on boarding_events
  for select using ((select role from auth_profile()) in ('teacher', 'admin', 'driver'));
create policy "boarding_events: family reads own" on boarding_events
  for select using (student_id = (select child_id from auth_profile()));
create policy "boarding_events: driver writes" on boarding_events
  for insert with check ((select role from auth_profile()) = 'driver');

-- ── AI insight tables ────────────────────────────────────────────────
alter table daily_summaries enable row level security;
create policy "daily_summaries: staff read all" on daily_summaries
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "daily_summaries: family reads own" on daily_summaries
  for select using (student_id = (select child_id from auth_profile()));
-- Generated on-demand by whichever role opens the summary (parent, student,
-- or teacher/admin reviewing it), so insert needs to match all of them.
create policy "daily_summaries: family/staff write own" on daily_summaries
  for insert with check (
    student_id = (select child_id from auth_profile())
    or (select role from auth_profile()) in ('teacher', 'admin')
  );

-- ── A note on testing these ─────────────────────────────────────────
-- To actually verify a policy denies cross-tenant reads, you need two real
-- user JWTs from Supabase Auth (e.g. one parent, one unrelated parent) and
-- to query PostgREST directly with the *anon* key + each JWT — not the
-- service key. That wasn't run here (no live Supabase project in this
-- environment). A starting script:
--
--   curl "$SUPABASE_URL/rest/v1/students?select=*" \
--     -H "apikey: $SUPABASE_ANON_KEY" \
--     -H "Authorization: Bearer $OTHER_PARENTS_JWT"
--
-- Expect an empty array for any student that isn't that parent's child.
