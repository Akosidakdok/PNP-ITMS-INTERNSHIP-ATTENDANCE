# Admin attendance deletion

**Goal:** Admins and superadmins can delete individual protected QR attendance entries from Attendance Management. Original scan evidence remains immutable; each deletion records its actor and reason.

**Approach:** Keep the existing confirmation and endpoints. Pass the authenticated actor into the service and use a service-role-only PostgreSQL RPC for protected deletions. The RPC verifies the saved administrator role and atomically appends evidence, deletes the entry/selfie, and updates the daily mirror. Existing unprotected deletion, supervisor scope, bulk DTR deletion and account deletion permissions remain unchanged. Rejected rescan removal still requires today's latest rejected entry.

**Alternatives:** Removing protection globally would also enable unrelated account/bulk deletions; soft deletion would require changing every attendance query. A narrow transactional RPC fits the requested admin action.

**Tech stack:** Existing Express, Supabase, PostgreSQL and Node test runner with PGlite.

- [x] Add failing integration coverage for admin/superadmin eligibility, rejected rescan rules, immutable evidence, rollback, mirrors and restricted RPC access.
- [x] Add a new migration and rerunnable deployment SQL; preserve all timestamp update guards.
- [x] Pass the authenticated actor to individual deletion services, invoke the RPC for protected entries, and clean attachments only after a successful transaction.
- [x] Run focused tests, full backend/frontend tests, build and syntax/diff checks.
- [ ] Apply the migration to the connected database and verify it. Blocked: CLI cannot connect over this network; linking the exact project fails because the authenticated Supabase account lacks project privileges. A service-role check confirms the RPC is absent (`PGRST202`). SQL is ready in `supabase/migrations/20261029060918_admin_attendance_deletion.sql` for the project owner to run in Supabase SQL Editor.

Final independent review found a daily mirror timestamp bug: surviving scans must use their original QR instant, rather than the randomized stored representation. Added failing afternoon-deletion and remaining-scan regressions, then corrected both SQL delivery paths. Deletion history also identifies the saved admin actor and retained evidence explicitly.

No real attendance entries will be deleted during verification.
