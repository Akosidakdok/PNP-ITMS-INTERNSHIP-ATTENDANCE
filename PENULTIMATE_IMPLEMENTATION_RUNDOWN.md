# PNP ITMS Internship Attendance System
## Penultimate Implementation Rundown

**Purpose:** Consolidate the Week 6 implementation plan, the August 26 administrator implementation plan, and the latest repository stability review into one execution and acceptance rundown.

**Repository date:** September 30, 2026  
**Scope:** Attendance, DTR, overrides, notifications, documents, evaluations, reports, calendar, authorization, frontend reliability, security, performance, and final acceptance.

This document is the penultimate checklist before final authenticated, device, and stakeholder acceptance. The original plans remain unchanged for historical traceability.

---

## 1. Current repository baseline

The latest read-only repository check produced the following baseline:

- Backend automated tests: **58 passed, 0 failed**.
- Frontend production build: **passed**.
- Worktree: **clean before this document was created**.
- Frontend build warning: the main application bundle is approximately 1.9 MB before gzip; the Face ID bundle is approximately 1.58 MB before gzip.
- Backend routes: approximately 106 routes remain concentrated in `backend/src/index.js`.
- Major modules include `backend/src/data.js`, `backend/src/index.js`, `frontend/src/pages/admin/AttendanceControl.jsx`, and `frontend/src/index.css`.
- Frontend has no automated test or lint script.
- Dependency audit reports four frontend vulnerabilities and four backend vulnerabilities. These require a controlled dependency-upgrade branch and regression testing.

### Security attention required immediately

`backend/src/env..development.local` is tracked by Git even though environment files are intended to be ignored. Its contents were not printed during the audit. If it contains real credentials, rotate those credentials, remove the file from version control, and add a correctly scoped ignore rule.

---

## 2. Recently implemented behavior to preserve

The following behavior is already implemented and must remain covered by regression checks:

- The intern DTR toolbar no longer displays the `Preview DTR Image` button.
- Live DTR screens continue to show actual approval statuses.
- Print, PNG, and PDF DTR exports temporarily change the timing-status headers to `Signature`.
- Exported overall-status headers temporarily change to `Supervisor Signature`.
- Exported status cells remain blank for wet signatures.
- Export-only labels do not change database values or live on-screen status values.

---

## 3. Consolidated implementation sequence

### Phase 0 - Repository, dependency, and security hygiene

#### 0.1 Protect credentials and environment configuration

Files and areas:

- `.gitignore`
- `backend/.gitignore`
- `backend/src/env..development.local`
- `backend/.env.example`

Actions:

- Remove tracked environment-like files from source control.
- Rotate any exposed Supabase, JWT, SMTP, or other credentials.
- Keep only variable names and safe placeholders in `.env.example`.
- Document required environment variables for local, test, staging, and production environments.
- Add a pre-commit or CI secret scan.

#### 0.2 Upgrade vulnerable dependencies safely

The audit currently reports:

- Frontend: `jspdf` critical, `react-router-dom` moderate, plus transitive DOMPurify and React Router findings.
- Backend: `nodemailer` high, `express` moderate, plus transitive `qs` and `body-parser` findings.

Actions:

- Create a dependency-upgrade branch.
- Update direct dependencies first.
- Review the `jspdf` major-version change before applying it.
- Test PDF generation, routing, email delivery, uploads, authentication, and production builds.
- Commit lockfile changes together with package changes.

#### 0.3 Harden backend perimeter controls

Files:

- `backend/src/index.js`
- `backend/src/middleware.js`
- `backend/src/auth.js`
- `frontend/src/utils/backendApi.js`
- `frontend/src/context/AuthContext.jsx`

Actions:

- Replace unrestricted `cors()` with an environment-based production allowlist.
- Add rate limiting for login, face verification, attendance scans, uploads, and expensive report endpoints.
- Keep body and file limits explicit and review concurrent memory usage from `multer.memoryStorage()`.
- Prefer HttpOnly, Secure, SameSite cookies for session tokens, or document and harden the current token-storage model with CSP and revocation controls.
- Add a consistent session invalidation strategy for password changes, logout, and compromised tokens.
- Add security headers, including a suitable Content Security Policy, in the deployment layer.

#### 0.4 Centralize error handling and observability

Actions:

- Add one Express error middleware for public error mapping.
- Do not return raw database or provider error messages for unexpected HTTP 500 responses.
- Use structured logs with request IDs, actor IDs, route names, and duration.
- Keep detailed error causes in server logs only.
- Standardize frontend handling for authentication expiry, legal-acceptance blocking, validation errors, network errors, and retryable service failures.

Acceptance:

- A production error response contains a safe user message and correlation ID only.
- Unauthorized requests never disclose protected records.
- Rate-limited endpoints return predictable status and retry metadata.
- CORS accepts only approved origins.

---

### Phase 1 - Standardize and verify the attendance/DTR model

Primary source plan: August 26 implementation plan.  
Primary areas:

- `backend/src/attendance.js`
- `backend/src/utils/dtrRecords.js`
- `backend/src/data.js`
- `frontend/src/pages/admin/AdminDTRViewer.jsx`
- `frontend/src/pages/intern/MyDTR.jsx`
- `frontend/src/components/dtr/DTRTable.jsx`
- `frontend/src/components/dtr/DTRPrint.jsx`

The current implementation uses a strict two-scan model:

- One Time In.
- One Time Out.
- 12:00 PM to 1:00 PM lunch overlap excluded.
- 8:00 AM to 5:00 PM equals exactly 8 rendered hours.
- A daily scan count is capped at two.

The remaining work is to make this contract explicit, consistently tested, and consistently represented in every consumer.

#### 1.1 Calculation contract

The calculation must:

1. Group records by Manila calendar date.
2. Accept one valid Time In and one valid Time Out.
3. Reject or exclude third scans, duplicate scan types, reversed times, invalid timestamps, and cross-date pairings.
4. Calculate elapsed time between the two scans.
5. Deduct only the overlap with the fixed 12:00 PM to 1:00 PM lunch interval.
6. Keep worked minutes and approved minutes distinct.
7. Use the same calculation for DTR, dashboards, reports, and exported documents.

Reference examples:

```text
8:00 AM to 5:00 PM = 9 elapsed hours - 1 lunch hour = 8 rendered hours
8:00 AM to 12:00 PM = 4 rendered hours
1:00 PM to 5:00 PM = 4 rendered hours
``` 

The public DTR contract should consistently expose the canonical fields:

- `date`
- `time_in`
- `time_out`
- `total_minutes`
- `total_hours`
- `worked_minutes`
- `approved_minutes`
- `approval_status`
- `remarks`
- `is_override`
- `override_type`
- `is_complete`

Legacy AM/PM fields may remain temporarily for compatibility, but they must not drive calculations.

#### 1.2 DTR output behavior

Verify that administrator, supervisor, and intern views show:

- Time In.
- Time Out.
- Rendered hours.
- Approval status.
- Override information.
- Correct monthly totals and required-hour progress.

Verify export paths:

- Browser Print.
- Export PNG.
- Export PDF.

For exports only, verify that:

- Timing status headers read `Signature`.
- Overall status header reads `Supervisor Signature`.
- Signature cells are blank.
- Live screens retain normal status headers and values.
- No export-only label is persisted to the database.

#### 1.3 Required DTR tests

Add or retain automated tests for:

- No scans.
- Time In only.
- Valid two-scan day.
- 8:00 AM to 5:00 PM equals 8 hours.
- Morning-only attendance.
- Afternoon-only attendance.
- Duplicate third scan.
- Duplicate Time In or Time Out.
- Invalid scan ordering.
- Cross-midnight records.
- Manila timezone date boundaries.
- Pending, approved, and rejected records.
- Worked versus approved minutes.
- Print/export signature headers and blank cells.

---

### Phase 2 - Make DTR overrides deterministic

Files:

- `backend/src/data.js`
- `backend/src/index.js`
- `frontend/src/pages/admin/AdminDTRViewer.jsx`
- `backend/src/utils/dtrRecords.js`

Allowed override types:

- `SUSPENDED`
- `EXCUSED`
- `HOURS`
- `OTHERS`

Requirements:

- Validate the date strictly.
- Validate hours as finite and within the approved range.
- Apply the same validation to bulk overrides.
- Enforce supervisor division scope.
- Keep one authoritative override per intern/date.
- Replace an existing override instead of accumulating active rows.
- Make Clear Override delete or deactivate the active override.
- Preserve the original two-scan calculation after clearing.
- Keep override remarks and audit history intact.

Preferred long-term improvement:

- Move override state from encoded `attendance_logs.remarks` strings into a dedicated table with a unique `(intern_id, attendance_date)` constraint, typed fields, and explicit lifecycle state.

Acceptance tests:

- Apply suspended, excused, custom-hours, and other overrides.
- Test custom hours `0`, `8`, and `24`.
- Reject negative, non-numeric, and excessive hours.
- Clear every override type.
- Confirm refresh persistence.
- Confirm DTR and report totals update immediately.
- Confirm duplicate override rows cannot remain active.

---

### Phase 3 - Authorization, privacy, and data validation

#### 3.1 Notifications

Files:

- `backend/src/index.js`
- `backend/src/data.js`
- `frontend/src/context/NotificationContext.jsx`

The current data queries are recipient-scoped. Preserve and test that behavior for:

- `GET /notifications`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`
- `DELETE /notifications/clear`

Acceptance:

- User A cannot retrieve User B's notifications.
- User A cannot mark User B's notification as read.
- Read-all affects only the authenticated recipient.
- Unread counts remain correct after reload.
- Calendar, face-enrollment, and review notifications target the correct recipient.

#### 3.2 Documents

Files:

- `backend/src/index.js`
- `backend/src/utils/fileValidation.js`
- `backend/src/data.js`
- `frontend/src/pages/intern/MyDocuments.jsx`

The current code includes file size, empty-file, MIME, extension, and document-type validation. Add integration coverage and harden the resource path:

- Keep the 25 MB limit enforced before storage processing.
- Prevent duplicate submissions.
- Prefer streaming or controlled temporary storage over unbounded concurrent memory buffering.
- Ensure failed validation creates no storage or database residue.
- Use short-lived authorized signed URLs.
- Return field-specific server errors.
- Validate that replacement and deletion are scoped to the owning intern or authorized staff.

Acceptance:

- Valid PDF and supported image uploads succeed.
- Empty, oversized, unsupported, malformed, and missing-type uploads fail safely.
- Duplicate document type behavior is deterministic.
- Filenames with commas, apostrophes, dashes, and Filipino characters remain intact.
- Unauthorized users cannot access another intern's file.

#### 3.3 Evaluations

Files:

- `backend/src/index.js`
- `backend/src/data.js`
- `backend/db/schema.sql`
- `frontend/src/pages/admin/PerformanceEval.jsx`

The current backend allow-lists evaluation fields and validates scores. Add database defense-in-depth:

- Add database checks for score ranges from 0 to 100.
- Enforce required score fields where policy requires them.
- Prevent clients from changing evaluator identity, protected timestamps, or ownership fields.
- Recalculate weighted totals server-side.
- Define one clear supervisor policy: read-only, create-only, or full evaluation management.
- Align `App.jsx`, `PerformanceEval.jsx`, backend routes, and documentation with that policy.

Acceptance:

- Scores at `0`, `74`, `75`, `80`, and `100` behave correctly.
- Negative, over-100, missing, and non-numeric values fail with HTTP 400.
- Arbitrary request fields are rejected.
- Unauthorized division access fails with HTTP 403.
- Released and unreleased visibility is consistent after reload.
- Weighted totals match an independent calculation.

#### 3.4 Calendar authorization

Files:

- `backend/src/index.js`
- `backend/src/data.js`
- `backend/db/schema.sql`

Current backend logic checks supervisor event ownership. Confirm and document the final policy:

- Administrator/superadmin: all events.
- Supervisor: own events or assigned-division events, according to the approved policy.
- Intern: read-only.
- Unauthorized update/delete: HTTP 403.

The check must remain in the backend service, not only in the frontend.

---

### Phase 4 - Reports, pagination, and consistency

#### 4.1 Reports and CSV

File:

- `frontend/src/pages/admin/Reports.jsx`

The current implementation includes CSV quoting, UTF-8 BOM, and stale-report clearing. Add regression tests and retain these rules:

- Escape commas, quotes, and line breaks.
- Use `text/csv;charset=utf-8`.
- Preserve Filipino names and school names.
- Disable export while loading or after a failed request.
- Never export an old report under newly selected filters.
- Revoke `URL.createObjectURL()` after download to avoid browser memory leaks.
- Ensure filename month/year matches the generated report.

Acceptance:

- Names containing commas and quotation marks.
- Filipino characters and dashes.
- Empty periods.
- Pending, approved, and rejected attendance.
- Division filtering.
- Failed request after changing filters.
- Excel and standards-compliant spreadsheet opening.

#### 4.2 Pagination and large selectors

Files:

- `frontend/src/pages/admin/AttendanceApproval.jsx`
- `frontend/src/pages/admin/DocumentReview.jsx`
- `frontend/src/pages/admin/PerformanceEval.jsx`
- `frontend/src/components/common/DataTable.jsx`
- `frontend/src/utils/interns.js`

Requirements:

- Reset page to 1 when filters change or reset.
- Clamp the page after deletions or approvals reduce result count.
- Preserve filters during navigation.
- Disable previous/next controls correctly.
- Keep server pagination metadata authoritative.
- Ensure selector helpers continue fetching all pages without silently truncating.
- Add search or server-side filtering for very large intern selectors.

Acceptance data sizes:

- 0 records.
- 1 record.
- Exactly 15 records.
- 16 records.
- 100+ records.
- Filter changes from a later page.
- Deletion or approval that reduces the final page count.

#### 4.3 Shared frontend utilities

Consolidate repeated DTR helpers currently duplicated across:

- `frontend/src/pages/intern/MyDTR.jsx`
- `frontend/src/pages/intern/InternDashboard.jsx`
- `frontend/src/components/dtr/DTRTable.jsx`

Create one tested utility for:

- Minute normalization.
- Record-minute fallback rules.
- Worked versus approved minutes.
- Duration formatting.
- Manila date/time formatting.

This prevents dashboards, DTR views, and reports from drifting apart.

---

### Phase 5 - Frontend reliability, performance, and maintainability

#### 5.1 Add frontend quality gates

Add scripts to `frontend/package.json` for:

- Linting.
- Unit/component tests.
- Optional browser end-to-end tests.

Priority test areas:

- Protected routes and role redirects.
- DTR calculations and export rendering.
- Attendance scan states and duplicate submission prevention.
- Camera permission denial, switching, rotation, background/resume, and cleanup.
- Pagination and filter state.
- Document upload and review.
- Evaluation visibility and permissions.
- Notifications and unread state.

#### 5.2 Improve bundle loading

The production build contains large application and Face ID bundles. Investigate:

- Lazy-loading admin and intern routes.
- Loading Face ID models only on scan/enrollment screens.
- Separating PDF/export libraries from the initial bundle.
- Compressing or selectively loading model assets.
- Measuring cold load on throttled mobile networks.

Acceptance:

- Login and dashboard do not load Face ID assets unnecessarily.
- Scan screen reports model-loading progress and retryable failures.
- Mobile cold-load time is measured on approved Android and iPhone devices.

#### 5.3 Split oversized modules

Prioritize extraction from:

- `backend/src/data.js` into domain services.
- `backend/src/index.js` into route modules.
- `frontend/src/pages/admin/AttendanceControl.jsx` into focused panels/hooks.
- `frontend/src/index.css` into maintainable feature or layout sections.

Preserve authorization and validation at service boundaries during extraction.

#### 5.4 Resource and async cleanup

Review every camera, timer, object URL, and request lifecycle:

- Stop camera tracks on unmount and modal close.
- Clear intervals and timeouts on unmount.
- Abort stale requests when filters or selected records change.
- Revoke generated download object URLs.
- Prevent state updates after unmount.
- Keep loading state transitions in `try/finally` blocks.

---

## 4. Verification schedule

The earlier Week 6 calendar is historical. Use this order for the remaining execution:

1. Credential and dependency safety review.
2. Attendance/DTR and override regression suite.
3. Authorization and privacy tests.
4. Document and evaluation validation tests.
5. Reports, pagination, and export tests.
6. Frontend unit/component tests.
7. Authenticated browser workflows for administrator, supervisor, and intern roles.
8. Physical Android Chrome and iPhone Safari camera testing.
9. Production build, dependency audit, and final acceptance review.

For every workflow record:

- Test ID.
- Role.
- Environment, browser, and device.
- Test data.
- Expected result.
- Actual result.
- Pass, fail, or blocked status.
- Evidence location.
- Related defect or commit.

---

## 5. Acceptance matrix

| Area | Acceptance result |
|---|---|
| Authentication | Invalid credentials, expiry, lockout, legal acceptance, and role boundaries behave predictably. |
| Attendance | A verified QR and face record one valid event; duplicate and invalid sequences are rejected. |
| DTR | Two-scan totals, lunch deduction, approval state, overrides, monthly summaries, and exports match independently calculated values. |
| DTR exports | Print/PNG/PDF show `Signature` and `Supervisor Signature` headers with blank signature cells; live screens remain unchanged. |
| Face ID | Eligible enrollment and renewal rules hold; camera failures recover without a page refresh. |
| Documents | Server and client validation agree; storage and signed access are scoped and residue-free after failure. |
| Evaluations | Scores, weighted totals, release state, and role permissions match one documented policy. |
| Projects | Membership, leader, supervisor, contributor, file, archive, and audit rules are enforced. |
| Reports | Filters match source DTR data; CSV columns and UTF-8 text survive Excel and standard readers. |
| Notifications | Each user sees and mutates only their own notifications. |
| Calendar | Resource ownership/division rules are enforced server-side. |
| Pagination | Empty, boundary, large, filtered, and post-mutation pages remain correct. |
| Mobile | Camera, loading, retry, background/resume, and rotation behavior pass on Android and iPhone. |

---

## 6. Documentation and defect-register cleanup

The existing Week 6 audit documents contain historical statuses that no longer fully match the source code. Before final sign-off:

- Re-run every defect-register item against the current code.
- Mark remediated findings with the implementation commit and regression evidence.
- Keep genuinely unverified items as `Blocked` rather than `Pass`.
- Update the baseline from 19 tests to the current 58 passing backend tests.
- Update the build-size measurements.
- Record dependency audit results and remediation decisions.
- Update `docs/week-6/DEFECT_REGISTER.md`.
- Update `docs/week-6/ACCEPTANCE_MATRIX.md`.
- Update `docs/week-6/AUDIT_BASELINE.md`.
- Update `docs/week-6/ENVIRONMENT_CHECKLIST.md`.
- Mark this rundown complete only after final authenticated and device evidence exists.

---

## 7. Definition of done

- [ ] No tracked credentials or environment files remain.
- [ ] Dependency vulnerabilities are resolved, accepted with documented rationale, or isolated by policy.
- [ ] CORS, token handling, rate limits, and error responses are production-safe.
- [ ] Attendance uses one consistent two-scan calculation everywhere.
- [ ] DTR overrides apply, replace, and clear deterministically.
- [ ] Notifications are recipient-scoped.
- [ ] Documents and evaluations are validated server-side and at database boundaries.
- [ ] CSV and DTR exports preserve structure, text encoding, and signature requirements.
- [ ] Pagination and large selectors remain correct beyond the first page.
- [ ] Frontend tests and linting run in CI.
- [ ] Camera, timers, object URLs, and stale requests are cleaned up.
- [ ] Frontend bundle performance is measured on target mobile devices.
- [ ] Backend tests pass.
- [ ] Frontend build passes.
- [ ] Authenticated browser workflows pass for all three roles.
- [ ] Android and iPhone camera workflows pass.
- [ ] All remaining P2/P3 items have an owner, target date, and approval.
- [ ] Stakeholder acceptance is recorded.
