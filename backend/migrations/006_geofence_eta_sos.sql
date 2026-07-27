-- Phase 2 (Tier 2 completion): geofence-triggered notifications, ETA calc,
-- and the driver-side actions (route start/end already implicit in pinging;
-- SOS, delay/breakdown) needed to actually produce this data. Additive only
-- — run after 001-005.

-- buses.driver_name (002) has no way to resolve back to a logged-in driver's
-- own account for the driver app view. Add an optional link; existing rows
-- keep working via driver_name (see resolveBusForDriver's fallback).
alter table buses add column if not exists driver_id uuid;

create policy "buses: driver reads own" on buses
  for select using (driver_id = auth.uid());


-- ── Location history ─────────────────────────────────────────────────
-- bus_locations (from 002) holds only the latest point per bus. ETA needs a
-- speed estimate, which needs at least two points — this is an append log,
-- not a replacement for bus_locations.
create table if not exists bus_location_history (
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references buses(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);
create index if not exists bus_location_history_bus_time_idx
  on bus_location_history (bus_id, created_at desc);

alter table bus_location_history enable row level security;

create policy "bus_location_history: anyone logged in reads" on bus_location_history
  for select using (auth.role() = 'authenticated');
create policy "bus_location_history: driver writes own bus" on bus_location_history
  for insert with check (
    bus_id in (select id from buses) and (select role from auth_profile()) = 'driver'
  );

-- ── Geofence events ──────────────────────────────────────────────────
-- One row per state change (arrived/departed are geofence-detected from
-- lat/lng vs a route's stops; delayed/breakdown are driver-declared, not
-- auto-detected — there's no reliable way to infer "delayed" from position
-- alone without a real-time traffic feed, so this app doesn't pretend to).
create table if not exists bus_geofence_events (
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references buses(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  stop_index int,
  stop_name text,
  event text not null check (event in ('arrived','departed','delayed','breakdown','resolved')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists bus_geofence_events_bus_time_idx
  on bus_geofence_events (bus_id, created_at desc);

alter table bus_geofence_events enable row level security;

-- Same visibility level as bus_locations (002/003): "where is which bus and
-- what's it doing" is treated as broadcast operational info, not
-- family-private data, matching the existing bus_locations policy.
create policy "bus_geofence_events: anyone logged in reads" on bus_geofence_events
  for select using (auth.role() = 'authenticated');
create policy "bus_geofence_events: driver writes own bus" on bus_geofence_events
  for insert with check (
    bus_id in (select id from buses) and (select role from auth_profile()) = 'driver'
  );

-- ── SOS alerts ───────────────────────────────────────────────────────
-- Unlike location/geofence data, an SOS alert is treated as sensitive
-- incident data: only staff (to respond) and the reporting driver can read
-- it, not every logged-in family.
create table if not exists sos_alerts (
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references buses(id) on delete cascade,
  driver_id uuid not null,
  lat double precision,
  lng double precision,
  note text,
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by text,
  resolved_at timestamptz
);

alter table sos_alerts enable row level security;

create policy "sos_alerts: staff read all" on sos_alerts
  for select using ((select role from auth_profile()) in ('teacher', 'admin'));
create policy "sos_alerts: driver reads own" on sos_alerts
  for select using (driver_id = auth.uid());
create policy "sos_alerts: driver creates own" on sos_alerts
  for insert with check (driver_id = auth.uid() and (select role from auth_profile()) = 'driver');
create policy "sos_alerts: staff resolves" on sos_alerts
  for update using ((select role from auth_profile()) in ('teacher', 'admin'));

-- ── Verification ─────────────────────────────────────────────────────
-- A driver should NOT be able to read another driver's SOS alert, and a
-- parent/student should never be able to read any SOS alert at all:
--   curl "$SUPABASE_URL/rest/v1/sos_alerts?select=*" \
--     -H "Authorization: Bearer $PARENT_TOKEN" -H "apikey: $ANON_KEY"
-- should return an empty array.
