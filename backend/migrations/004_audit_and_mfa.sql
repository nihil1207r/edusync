-- Adds: audit logging for sensitive admin actions, and the profile flag
-- MFA enrollment needs. Run after 001/002/003.

-- ── Audit log ────────────────────────────────────────────────────────
-- Every fee change, grade override, role change, and data export is
-- recorded here with who did it, when, and a before/after diff — per the
-- brief's Tier 1 security baseline (§5, "Audit logging").
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,                 -- null for system-originated actions (e.g. the Razorpay webhook)
  actor_name text,
  actor_role text,
  action text not null,          -- e.g. 'fee.create', 'grade.override', 'role.change', 'data.export'
  target_table text,
  target_id text,
  diff jsonb,                    -- {"before": {...}, "after": {...}} where applicable
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_actor on audit_logs(actor_id);
create index if not exists idx_audit_logs_created on audit_logs(created_at desc);

alter table audit_logs enable row level security;

-- Audit logs are written by the backend using the actor's own token (so
-- "who did it" is provably tied to their auth.uid()), but only admins can
-- ever read the log back.
create policy "audit_logs: actor writes own" on audit_logs
  for insert with check (actor_id = auth.uid());
create policy "audit_logs: admin reads all" on audit_logs
  for select using ((select role from auth_profile()) = 'admin');
-- Deliberately no update/delete policy for anyone — the log is append-only.

-- ── MFA enrollment tracking ─────────────────────────────────────────
-- Supabase GoTrue tracks the actual TOTP factor, but we mirror whether
-- enrollment is complete on the profile row so the backend can cheaply
-- decide "does this admin/teacher still need to enroll" without an extra
-- GoTrue round-trip on every request.
alter table profiles add column if not exists mfa_enrolled boolean not null default false;
