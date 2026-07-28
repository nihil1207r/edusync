# What's here and how to apply it

## 1. `009_fix_driver_bus_scope.sql`  — apply to your live Supabase project
Run this once, after migrations 001-008, in the Supabase SQL editor.
Fixes an unscoped RLS bug where any driver-role account could write GPS
location/geofence data for ANY bus, not just their own. Verified: ran
clean against a from-scratch Postgres instance with all 9 migrations
in order, and the resulting policies were confirmed in pg_policy to be
scoped by `buses.driver_id = auth.uid()`.

## 2. MFA enforcement — pick ONE, currently Option B is applied in your working copy
Your repo currently has `RoleRequiresMFA` hardcoded to `false` for every
role (MFA fully implemented but not enforced), which contradicted your
own JUDGES.md/NOTES.md claim that MFA is enforced — and made
`go test ./...` fail. Now fixed to be internally consistent, currently
set to **Option B**.

- **Option B (currently applied — code enabled)**: `auth_optionB_APPLIED.go` +
  `auth_test_optionB_APPLIED.go`. MFA is required for admin/teacher roles.
  go build / go vet / go test ./... all verified passing with this applied.
  ⚠️ Before your live round: confirm every demo admin/teacher account is
  actually TOTP-enrolled, or their live login will fail on stage.

- **Option A (alternative — keep MFA off for the demo)**: swap in
  `auth_test_optionA_ALTERNATIVE.go` as your auth_test.go, and revert
  `RoleRequiresMFA` in auth.go back to `return false`. Also update the MFA
  line in JUDGES.md/NOTES.md to say it's implemented but disabled for the
  demo build, per the wording suggested in chat, so your docs stay honest.

## Verified environment
- Postgres 16, all 9 migrations applied clean, 35 tables, policies confirmed via pg_policy
- go build ./... : PASS
- go vet ./...   : PASS
- go test ./...  : PASS (with Option B applied)
- frontend: tsc --noEmit PASS, vitest run 6/6 PASS
