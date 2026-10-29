# Controlled Scan Audit Implementation Plan

**Goal:** Preserve exact QR scan timestamps and record policy-based DTR adjustments only for explicitly Superadmin-assigned attendance controls.

**Architecture:** Keep `actual_scan_time` and existing `recorded_scan_time`; expose the latter as `dtr_time` for controlled scans. Use database triggers for atomic, append-only audit snapshots and timestamp protection. Reuse existing Superadmin history access.

**Scope:** Future policy adjustments and explicitly requested manual edits only. Preserve older scan evidence in new audit rows without rewriting any existing DTR/log timestamp. No existing-record resync, new QR flow, or changes to time-out, lunch, or rendered-hour calculations. Keep the current checkout so earlier preview changes remain included.

## Tasks

- [x] Add failing integration cases for explicitly approved regular-profile morning adjustments, unassigned/default profiles, inactive/expired assignments, and unchanged time-outs/lunch. Verify 08:13 actual versus 08:00 DTR.
- [x] Add explicit assignment provenance to profile resolution and use it only for the additional morning policy handling. Keep existing policy paths otherwise unchanged. Stop control saves from rewriting existing DTR records.
- [x] Generate an additive migration: controlled scan metadata, `dtr_time`, `time_adjusted`, append-only audit snapshots, immutable actual timestamps, and protection that survives unassignment. Test actual SQL triggers in an isolated PostgreSQL runtime; never mutate production data during verification.
- [x] Attach actor/reason to controlled manual edits; save both scans, mirror, and edit history in one transaction. Reject read failures and unauthorized actors before writes.
- [x] Extend Superadmin history with actual scan, DTR time, account/date, policy, and automatic/manual provenance. Add adjustment details to the existing selfie preview.
- [x] Run backend/frontend suites, production build, SQL regression tests, and review the final diff.

## Review Focus

- A default/fallback profile is not an explicit privilege assignment.
- Timestamp protection persists after unassignment and never fabricates scans for manual entries.
- Audit failures roll back the corresponding controlled log change.
- An approval or date edit never rewrites the actual timestamp.
- Migration and control saves do not rewrite existing attendance data.

## Decisions

- Existing assignment by a Superadmin, active profile, and effective date constitute authorization; snapshot that approved policy at scan time.
- Audit entries retain numeric account/log identifiers and policy snapshots without cascading foreign keys.
- Protected scan rows cannot be deleted; other accounts retain their current behavior.
- Execute in this session; deployment remains separate from source changes.
- Review fixes: archive legacy evidence at migration/control enrollment without changing old DTRs; query audit evidence before destructive cleanup; use a service-only transaction with an explicit Superadmin actor for every controlled correction.

## Deployment

Apply `supabase/migrations/20261029014221_superadmin_scan_audit.sql` after the existing `backend/db/migration_superadmin_attendance_control.sql`, before deploying this backend. The migration creates protected audit snapshots for available original timestamps and leaves prior DTR/log timestamps unchanged. It does not invent missing legacy scan timestamps.

The application uses the backend's existing service-role connection. Anonymous and frontend-authenticated roles receive no audit-table access or controlled-correction RPC permission. Superadmin audit viewing continues through the existing protected history endpoints.

## Verification

234 backend tests and 21 frontend tests pass. The backend suite executes the migration, immutable-evidence triggers, approval checks, and transactional rollback cases against isolated PostgreSQL via the pinned PGlite development dependency. The production frontend build passes with the existing large-chunk advisory. Independent review findings were addressed with regression coverage. No production database was modified.

## Follow-up: stored morning scan adjustment

The user explicitly chose to change the stored `actual_scan_time` as well as the display. This supersedes the earlier immutability rule for that field's original value, while preserving the real scan permanently:

- `original_scan_time` and audit `actual_scan_time` retain the real QR instant.
- For explicitly controlled Time In scans with automatic first scan enabled, local times after 08:00 and before 12:00 are stored in log `actual_scan_time` as exactly 08:00. Earlier scans retain their times. No random times are generated.
- `scan_time_adjusted` marks this representation change. The preview identifies it as Adjusted Scan Time; Superadmins also see Original QR Scan.
- The audit adds `stored_scan_time` and a distinct automatic adjustment event/reason. Both the original instant and adjusted stored value remain protected after insertion.
- DTR pairing still uses original QR order. Recorded DTR values, time-out, lunch, and rendered-hour calculations are unchanged by this follow-up.
- Apply `20261029023532_controlled_morning_scan_adjustment.sql` after the first migration. It also adjusts existing protected morning stored values and protects newly enrolled evidence; original audit evidence is captured first, in the same transaction. Existing official DTR values stay unchanged.

## Follow-up: randomized adjusted morning values

The user requested a 07:45:00-08:00:00 PHT range instead of a fixed 08:00 value. Eligible late-morning controlled scans now choose one of 901 whole-second values once and persist it. `scan_adjustment_rule=randomized_morning_v1` prevents rerandomization during status updates, DTR edits, enrollment changes, or deployment reruns. Original QR timestamps remain immutable, and audit entries record the original, chosen stored time, and explicit randomization reason/rule. Earlier arrivals, lunch, afternoon time-outs, normal accounts, and official DTR calculations retain their behavior.

Apply `20261029025754_randomized_controlled_morning_scan.sql` after the two earlier migrations, or rerun the updated combined `backend/db/deploy_controlled_attendance.sql`. Existing eligible fixed-time entries receive a one-time conversion with an automatic audit entry.
