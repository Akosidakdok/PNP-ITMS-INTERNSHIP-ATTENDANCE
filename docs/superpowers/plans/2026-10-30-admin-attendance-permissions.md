# Admin Attendance Permissions Implementation Plan

**Goal:** Give Admin the five permissions explicitly requested: attendance control, protected DTR corrections, full DTR correction, audit history, and listing/creating Admin accounts.

**Architecture:** Reuse the existing Admin/Superadmin middleware and existing screens. Extend the database's approver checks to both administrator roles without changing scan immutability, transaction boundaries, service-role grants, or unrelated Superadmin permissions.

**Tech Stack:** Express, React, Supabase PostgreSQL, node:test, PGlite.

**Spec:** The user's five-item permission list and screenshot of a rejected protected DTR time edit.

## Constraints

- Supervisor and Intern must remain blocked from these permissions.
- Record the actual approving administrator's name and role in new immutable audit snapshots.
- Preserve original QR timestamps and require a reason for corrections.
- Keep photo management and username changes restricted to Superadmin.

## Tasks

- [x] Add failing PostgreSQL regression coverage for Admin policy assignment, protected corrections, role rejection, immutable evidence, and rollback; add API guard coverage and audit identity coverage.
- [x] Extend the selected API guards and database functions; create a forward migration through the Supabase CLI and include it in the existing rerunnable deployment script.
- [x] Expose existing Attendance Control, Admin Accounts, full DTR editing, and history controls to Admin; update role-specific wording.
- [x] Run backend/frontend tests, production build, and review the diff. Verify the SQL deployment in PGlite; apply the remote migration only if a configured database connection is available.

## Validation and Deployment

- Backend: 276 tests passed, including PostgreSQL role rejection, Admin-controlled policy insertion, protected corrections, audit rollback, and unchanged original QR evidence.
- Frontend: 22 existing tests passed; an additional rendered-component test passed for correction/history visibility across Admin, Superadmin, Supervisor, and Intern.
- Production frontend build passed. Independent code review reported no findings.
- Remote database update is pending: the signed-in Supabase CLI account cannot access the configured project (`LinkProjectStatusError`: insufficient privileges). Run `supabase/migrations/20261030101526_admin_attendance_permissions.sql` in that project's SQL Editor after deploying/restarting the backend. This migration requires the existing attendance audit/controlled-scan migrations; the combined deployment script includes prerequisites for older installations.

## Review Focus

- Admin correction of a legacy protected scan after unassignment.
- Admin time-only edits retain approval status.
- Admin-assigned profiles produce protected, audited scans.
- Audit history attributes Admin edits to Admin rather than Superadmin.
- Unrelated Superadmin-only photo and username APIs remain restricted.
