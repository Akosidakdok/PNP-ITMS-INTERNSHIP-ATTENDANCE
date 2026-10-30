# DTR Audited Deletion Fix

**Goal:** Make the existing DTR Delete / Reset action work for protected attendance while preserving original QR evidence and audit identity.

**Architecture:** Replace the multi-request DTR delete service with one service-only PostgreSQL function per date. Reuse `delete_admin_attendance_entry` inside that transaction for per-scan immutable evidence and authorization, detach prior edit history before removing daily mirrors, and store the user's reason. The existing Admin/Superadmin route guard remains authoritative and the database independently validates the actor. Clean up attachment storage only after successful commit.

**Scope:** Preserve existing `attendance`, `override`, and `all` target selection behavior. Update confirmation copy to explain that evidence remains in audit history. Surface partial batch failures instead of displaying unconditional success.

- [x] Add failing service and PostgreSQL regressions for the reported protected-date deletion, role rejection, immutable audit evidence, and rollback.
- [x] Add the transactional function in a forward migration and the combined deployment SQL; wire the service to it.
- [x] Update deletion copy and partial-result handling.
- [x] Run relevant/full tests, production build, and code review. Provide the SQL migration for Supabase; remote deployment remains unavailable under the connected account's project permissions.

## Validation

- Full backend suite: 289 tests passed; two additional PostgreSQL edge-case tests subsequently passed (mirror-only dates and record-linked scans outside the selected day).
- Full frontend suite: 23 tests passed.
- Production frontend build passed; Vite reported the existing large-bundle warning.
- Independent review: no actionable findings.
- Database deployment file: `supabase/migrations/20261030104116_dtr_audited_deletion.sql` (also included in the combined deployment script).
