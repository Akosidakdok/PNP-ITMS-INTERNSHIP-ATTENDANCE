# Week 6 Defect Register

**Created:** August 25, 2026  
**Status:** Open defects identified during the August 24–25 baseline and administrator static/API audit.

## Priority Definitions

- **P0 — Blocker:** Security/data exposure, data loss, or attendance cannot be recorded. Fix immediately.
- **P1 — Critical:** A core workflow cannot be completed reliably or safely without a practical workaround. Resolve before acceptance.
- **P2 — Major:** Incorrect secondary behavior with a workaround. Resolve this week when regression risk permits or assign to Week 7.
- **P3 — Minor:** Cosmetic or low-impact usability issue.

## Register

| ID | Priority | Area | Summary | Evidence | Status |
|---|---|---|---|---|---|
| W6-DTR-001 | **P1** | Attendance/DTR | The attendance flow permits two daily scans, but DTR logic expects up to four ordered scans. A normal Time In/Time Out pair spanning the full workday is treated as a morning session ending at noon, undercounting hours. | `backend/src/attendance.js` daily limit and `backend/src/data.js` `computeStandardDtrRecord` | Open — blocks DTR/report acceptance |
| W6-DTR-002 | **P1** | DTR override | “Clear Override” inserts an `OVERRIDE:NONE` row instead of removing/replacing the earlier override. DTR selects a prior recognized override, so clearing may not clear the day. The API also accepts unsupported types and out-of-range hours. | `frontend/src/pages/admin/AdminDTRViewer.jsx`; `backend/src/data.js` `setDtrOverride` | Open — blocks DTR acceptance |
| W6-NOT-001 | **P1** | Notifications/security | Administrators and supervisors are passed as global notification users. They can retrieve all intern notifications, mark any notification read, and `read-all` updates every notification row. | `backend/src/index.js:606-630`; `backend/src/data.js:1064-1100`; schema defines `user_id` ownership | Open — blocks notification and privacy acceptance |
| W6-DOC-001 | **P1** | Documents/validation | Document upload uses unbounded in-memory storage and has no server-side file size, MIME/type, empty-file, role, or document-type validation. | `backend/src/index.js:105-107,695`; `backend/src/data.js` `createDocument` | Open — blocks document acceptance |
| W6-EVAL-001 | **P1** | Evaluations/validation | Evaluation create/update spreads arbitrary request fields into database mutations. Score ranges and weighted totals are enforced only by frontend inputs; the schema has no score constraints. | `backend/src/index.js:647-674`; `backend/src/data.js:1152-1181`; `backend/db/schema.sql:77-91` | Open — blocks evaluation acceptance |
| W6-RPT-001 | **P1** | Reports/encoding | CSV generation joins raw values with commas and does not escape commas, quotes, or line breaks. It also omits an Excel-compatible UTF-8 BOM, so columns and Filipino names can be corrupted. | `frontend/src/pages/admin/Reports.jsx:29-39` | Open — blocks report/encoding acceptance |
| W6-LOAD-001 | **P1** | Reports/loading | If report generation fails after filters change, the previous result remains visible and exportable using the newly selected period in the filename/header. This can produce mislabeled reports. | `frontend/src/pages/admin/Reports.jsx:20-28,40-78` | Open — blocks report accuracy acceptance |
| W6-CAL-001 | **P1** | Calendar/authorization | Any supervisor can update or delete any calendar event. The routes verify staff role but do not verify event creator, division, or another resource-level policy. | `backend/src/index.js:741-788`; `backend/db/schema.sql:157-166` | Open — requires ownership-policy decision and fix |
| W6-PAG-001 | **P2** | Attendance pagination | Changing attendance status/date filters does not reset `page` to 1. A later page can show an empty or invalid page even when matching records exist. | `frontend/src/pages/admin/AttendanceApproval.jsx:13-25,118-140` | Open — pagination remediation |
| W6-PAG-002 | **P2** | Documents/evaluations | Document Review and Performance Evaluations load all results and provide fixed/no-op pagination props. Document listing also creates a signed URL per returned file. | `DocumentReview.jsx:152-157`; `PerformanceEval.jsx:356`; backend list helpers | Open — pagination remediation |
| W6-SCALE-001 | **P2** | Administrator selectors | DTR, evaluations, divisions, departments, and schools fetch at most 100 interns with no way to reach later records. | `AdminDTRViewer.jsx:42`; `PerformanceEval.jsx:107`; division/school detail loaders | Open — scale acceptance |
| W6-EVAL-002 | **P2** | Supervisor evaluation policy | `App.jsx` passes `readOnly` for supervisors, but `PerformanceEval` ignores the prop. The component allows supervisor creation and visibility toggling, while comments describe a different permission model. | `frontend/src/App.jsx:46-49`; `PerformanceEval.jsx:88-164,303-356` | Open — acceptance decision required |
| W6-VAL-001 | **P2** | General validation | Several server-side CRUD and password-reset routes check only presence, rely on database errors, or return HTTP 500 for invalid user input. Frontend constraints can be bypassed. | Division/school/supervisor/intern routes in `backend/src/index.js` and payload-spread helpers in `data.js` | Open — validation hardening |
| W6-TEST-001 | **P2** | Test coverage | Frontend package has no test script or browser regression suite, leaving all role workflows, pagination, loading states, reports, and camera lifecycle without automated regression protection. | `frontend/package.json`; current backend-only `test` directory | Open — add focused workflow coverage |
| W6-PERF-001 | **P2** | Mobile/loading | Production build emits approximately 1.74 MB and 1.58 MB JavaScript chunks. Cold mobile Face ID loading may be slow or fail on constrained devices. | Vite production-build warning | Open — validate on devices before optimization |

## Reproduction Details

### W6-DTR-001 — Two-scan/Four-slot Mismatch

1. Record a Time In before 08:00 and a Time Out after 17:00.
2. The attendance service stores two rows and marks daily scanning complete.
3. DTR assigns the second row to `amOutRaw` and clamps it to noon.
4. No `pmInRaw` or `pmOutRaw` exists, so afternoon hours are not credited.

**Expected:** The attendance scan model and DTR formula use the same approved daily sequence.  
**Actual:** A valid full-day two-scan sequence can produce only morning credit.

### W6-DTR-002 — Override Cannot Be Reliably Cleared

1. Apply a recognized override such as `SUSPENDED`.
2. Select “Clear Override.”
3. The backend inserts `OVERRIDE:NONE` but does not delete or replace the prior row.
4. DTR searches for a recognized override and may continue using the old one.

**Expected:** One authoritative override per intern/date; clearing removes its effect.  
**Actual:** Multiple override rows accumulate and an earlier override can remain active.

### W6-NOT-001 — Global Staff Read State

1. Authenticate as an administrator or supervisor.
2. Request `GET /notifications`.
3. The route passes `isAdmin = true` for both staff roles, so no `user_id` filter is applied.
4. Call `PATCH /notifications/read-all`; the helper updates every row using `id != 0`.

**Expected:** Notification visibility and read state are scoped to the authenticated recipient.  
**Actual:** Staff can observe or change unrelated recipients' notification state.

### W6-RPT-001 — CSV Column/Encoding Failure

1. Generate a report containing `Dela Cruz, Juan` or a school name containing a comma.
2. Export CSV.
3. Raw values are joined with commas without quoting or escaping.
4. Open the file in Excel and inspect both columns and non-ASCII names.

**Expected:** RFC-style CSV escaping and reliable UTF-8 import.  
**Actual:** Commas create extra columns; UTF-8 detection is not guaranteed.

## Triage Order

1. W6-NOT-001 — recipient privacy and global mutation
2. W6-DTR-001 and W6-DTR-002 — core attendance/DTR correctness
3. W6-DOC-001 and W6-EVAL-001 — server-side validation and resource safety
4. W6-RPT-001 and W6-LOAD-001 — report correctness and encoding
5. W6-CAL-001 and W6-EVAL-002 — clarify and enforce staff permissions
6. Pagination, scale, automated coverage, and bundle performance items

## Audit Limitations

These defects are confirmed by deterministic source traces. Authenticated browser reproduction is still required after Supabase health and browser connectivity are restored. No defect is marked resolved until an automated or interactive regression case passes.

