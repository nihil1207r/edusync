-- Fix: driver-write RLS policies on bus_locations, bus_location_history, and
-- bus_geofence_events checked `bus_id in (select id from buses)` — which
-- returns every bus in the school, not the writing driver's own bus. Any
-- authenticated driver-role account could therefore post a location/geofence
-- event for a bus they aren't assigned to.
--
-- buses.driver_id (added in 006) is the real link and is already used
-- correctly by "buses: driver reads own" — these three policies were never
-- updated to match it. This migration drops and recreates them scoped by
-- driver_id, with the same driver_name fallback the app already tolerates
-- for older/unlinked buses left as a documented gap (not fixable via RLS
-- alone — see resolveBusForDriver in bus_eta_sos.go).
--
-- Safe to run once, after 001-008.

drop policy if exists "bus_locations: driver writes own bus" on bus_locations;
create policy "bus_locations: driver writes own bus" on bus_locations
  for insert with check (
    bus_id in (select id from buses where driver_id = auth.uid())
    and (select role from auth_profile()) = 'driver'
  );

drop policy if exists "bus_location_history: driver writes own bus" on bus_location_history;
create policy "bus_location_history: driver writes own bus" on bus_location_history
  for insert with check (
    bus_id in (select id from buses where driver_id = auth.uid())
    and (select role from auth_profile()) = 'driver'
  );

drop policy if exists "bus_geofence_events: driver writes own bus" on bus_geofence_events;
create policy "bus_geofence_events: driver writes own bus" on bus_geofence_events
  for insert with check (
    bus_id in (select id from buses where driver_id = auth.uid())
    and (select role from auth_profile()) = 'driver'
  );

-- Note: a driver whose bus predates the driver_id link (created before 006,
-- still matched only via driver_name in resolveBusForDriver) will fail these
-- writes until an admin links them via driver_id in Admin → Buses & Routes.
-- That's a real, narrower gap than before this patch, not a regression —
-- see bus_eta_sos.go's fallback comment.
