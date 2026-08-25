# Wednesday, August 26, 2026 — Core Implementation Plan

## Objective

Complete the administrator-side implementation blockers identified during the Week 6 audit, with the attendance system standardized to a strict two-scan daily model:

- One Time In.
- One Time Out.
- 12:00–1:00 PM lunch break excluded.
- 8:00 AM–5:00 PM produces exactly 8 rendered hours.
- No four-scan AM/PM model.

The implementation should leave the administrator workflows ready for authenticated regression testing.

---

## 1. Standardize the attendance and DTR model

Primary defects: `W6-DTR-001`, `W6-DTR-002`

Files:

- `backend/src/attendance.js`
- `backend/src/data.js`
- `frontend/src/pages/admin/AdminDTRViewer.jsx`
- `frontend/src/pages/intern/MyDTR.jsx`
- `frontend/src/components/dtr/DTRTable.jsx`

### Backend implementation

Replace the current four-slot calculation in `computeStandardDtrRecord`.

The calculation should:

1. Group approved attendance records by Manila calendar date.
2. Accept at most two scans per day.
3. Treat the earliest valid scan as `time_in`.
4. Treat the later valid scan as `time_out`.
5. Reject or exclude:
   - A third scan.
   - A second Time In.
   - A second Time Out.
   - A Time Out earlier than Time In.
6. Calculate elapsed time between Time In and Time Out.
7. Deduct the overlap with the fixed lunch interval from 12:00 PM to 1:00 PM.
8. Round the final value to two decimal places.

Recommended calculation:

```text
elapsed_hours = time_out - time_in
lunch_overlap = overlap between [time_in, time_out] and [12:00, 13:00]
rendered_hours = elapsed_hours - lunch_overlap
```

Examples:

```text
8:00 AM–5:00 PM = 9 hours - 1 hour = 8 hours
8:00 AM–12:00 PM = 4 hours
1:00 PM–5:00 PM = 4 hours
```

The DTR response should use:

- `time_in`
- `time_out`
- `total_hours`
- `approval_status`
- `remarks`
- `is_override`
- `override_type`

The old `am_time_in`, `am_time_out`, `pm_time_in`, and `pm_time_out` fields should no longer drive calculations. They should either be removed from consumers or returned only temporarily for compatibility.

### Frontend implementation

Update the administrator and intern DTR displays to show:

- Time In.
- Time Out.
- Rendered hours.
- Approval status.
- Override information.

Remove any UI assumptions that a day can contain morning and afternoon pairs.

### Acceptance tests

Add tests for:

- No scans.
- Time In only.
- Valid two-scan day.
- 8:00 AM–5:00 PM equals 8 hours.
- Morning-only attendance.
- Afternoon-only attendance.
- Duplicate third scan.
- Invalid scan ordering.
- Records crossing midnight.
- Manila timezone date boundaries.
- Pending, approved, and rejected attendance.

---

## 2. Correct DTR override behavior

Files:

- `backend/src/data.js`
- `backend/src/index.js`
- `frontend/src/pages/admin/AdminDTRViewer.jsx`

### Implementation requirements

- Allow only supported override types:
  - `SUSPENDED`
  - `EXCUSED`
  - `HOURS`
  - `OTHERS`
- Validate `hours` as a finite number.
- Reject negative or excessive hour values.
- Validate that `date` is a valid date.
- Ensure supervisors can override only interns in their division.
- Ensure one authoritative override exists per intern/date.
- Replace an existing override instead of accumulating multiple active overrides.
- Make “Clear Override” delete or deactivate the active override.
- Apply the same validation to bulk overrides.

### Acceptance tests

- Apply a suspended override.
- Apply an excused override.
- Apply custom hours of `0`, `8`, and `24`.
- Clear each override.
- Confirm the original two-scan calculation returns after clearing.
- Confirm DTR and reports immediately reflect the override.

---

## 3. Restrict notifications to their recipients

Primary defect: `W6-NOT-001`

Files:

- `backend/src/index.js`
- `backend/src/data.js`

### Implementation requirements

Change all notification queries and mutations so they always use the authenticated user ID:

- `GET /notifications`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`

Remove the current role-based global access behavior.

A notification update must affect zero rows when the notification belongs to another user. The API should return an authorization or not-found response rather than reporting success.

### Acceptance tests

- User A cannot retrieve User B’s notifications.
- User A cannot mark User B’s notification as read.
- Read-all affects only User A’s notifications.
- Unread counts remain correct after refresh.
- Notification creation still targets the correct recipient.

---

## 4. Add secure document upload validation

Primary defect: `W6-DOC-001`

Files:

- `backend/src/index.js`
- `backend/src/data.js`
- `frontend/src/pages/intern/MyDocuments.jsx`

### Implementation requirements

Configure upload handling to:

- Enforce a maximum file size before processing.
- Reject missing files.
- Reject empty files.
- Validate permitted MIME types.
- Validate permitted extensions.
- Validate `document_type`.
- Reject unsupported document types.
- Return HTTP 400 for invalid input.
- Avoid creating storage/database records after validation failure.
- Prevent duplicate upload submissions.

The frontend should display the server’s field-specific error rather than a generic failure message.

### Acceptance tests

Test:

- Valid PDF.
- Valid supported image.
- Empty file.
- Oversized file.
- Unsupported executable/script.
- Missing document type.
- Duplicate document type.
- Filename containing commas, apostrophes, dashes, and Filipino characters.

---

## 5. Harden evaluation input and score processing

Primary defect: `W6-EVAL-001`

Files:

- `backend/src/index.js`
- `backend/src/data.js`
- `backend/db/schema.sql`

### Implementation requirements

- Replace arbitrary request-body spreading.
- Allow-list evaluation fields.
- Validate intern ownership and supervisor division scope.
- Validate every score server-side.
- Reject values below `0` or above `100`.
- Recalculate weighted totals on the server.
- Apply consistent rounding.
- Prevent clients from changing evaluator identity and protected timestamps.
- Validate release/visibility values.

### Acceptance tests

- Scores of `0`, `74`, `75`, `80`, and `100`.
- Negative scores.
- Scores above `100`.
- Missing required score fields.
- Invalid intern ID.
- Unauthorized division access.
- Released and unreleased evaluation visibility.
- Save, edit, reload, and compare weighted total against an independent calculation.

---

## 6. Correct report generation and CSV export

Primary defects: `W6-RPT-001`, `W6-LOAD-001`

File:

- `frontend/src/pages/admin/Reports.jsx`

### Implementation requirements

Implement a CSV serializer that:

- Wraps values containing commas, quotes, or line breaks.
- Escapes embedded quotes correctly.
- Adds a UTF-8 BOM.
- Uses `text/csv;charset=utf-8`.
- Handles null values.
- Preserves Filipino names and school names.
- Uses the actual generated month/year in the filename.

Fix stale report state:

- Clear the previous report when a new request begins.
- Disable export while loading.
- Disable export after a failed request.
- Prevent an old report from being exported under new filters.
- Display a retryable error state.

### Acceptance tests

- Names containing commas.
- Names containing quotation marks.
- Filipino characters.
- Empty report period.
- Pending, approved, and rejected attendance.
- Department filtering.
- Failed request after changing filters.
- CSV opened in Excel or equivalent spreadsheet software.

---

## 7. Repair administrator pagination

Primary defect: `W6-PAG-001`

Files:

- `frontend/src/pages/admin/AttendanceApproval.jsx`
- `frontend/src/components/common/DataTable.jsx`

### Implementation requirements

- Reset page to `1` whenever status or date filters change.
- Reset page when filters are cleared.
- Clamp the page to the valid last page.
- Recover when a filter reduces the result count.
- Preserve active filters during navigation.
- Ensure next/previous controls are disabled correctly.

Apply the same correction to document review and evaluations if their list components are included in the Wednesday scope.

### Acceptance tests

Use:

- 0 records.
- 1 record.
- Exactly 15 records.
- 16 records.
- 100+ records.
- Filter changes while on a later page.
- Deletion or approval that reduces the number of pages.

---

## 8. Enforce calendar resource authorization

Primary defect: `W6-CAL-001`

Files:

- `backend/src/index.js`
- `backend/src/data.js`
- `backend/db/schema.sql`

Recommended policy:

- Administrator: all calendar events.
- Supervisor: own or assigned-division events.
- Intern: read-only.
- Unauthorized update/delete: HTTP 403.

The authorization check must exist in the backend route/service, not only in the UI.

---

## 9. Complete administrator workflow verification

After implementation, execute the administrator workflows:

- Login and protected-route access.
- Dashboard and QR code.
- Intern management.
- Supervisor management.
- Divisions, departments, and schools.
- Attendance approval and rejection.
- Two-scan DTR calculation.
- DTR overrides and clearing.
- Face ID renewal review.
- Document upload and document review.
- Evaluation creation, editing, and release.
- Project administration.
- Reports and CSV export.
- Calendar authorization.
- Notification privacy and read state.
- Profile and password changes.

Each workflow must record:

- Test ID.
- Test data.
- Expected result.
- Actual result.
- Pass/fail/blocked status.
- Evidence location.
- Related defect ID.

---

## 10. Required regression and final outputs

Run:

- Existing backend tests.
- New DTR calculation tests.
- Override validation tests.
- Notification ownership tests.
- Document validation tests.
- Evaluation validation tests.
- Report export tests.
- Authorization tests.
- Frontend production build.
- UTF-8 source scan.

Update:

- `docs/week-6/DEFECT_REGISTER.md`
- `docs/week-6/ACCEPTANCE_MATRIX.md`
- `docs/week-6/ENVIRONMENT_CHECKLIST.md`
- `WEEK_6_IMPLEMENTATION_PLAN.md`

## Wednesday definition of done

- Attendance uses only one Time In and one Time Out.
- 12:00–1:00 PM is excluded from rendered hours.
- 8:00 AM–5:00 PM calculates as exactly 8 hours.
- DTR and reports use the same calculation.
- Overrides can be applied and cleared reliably.
- Notifications are recipient-scoped.
- Documents and evaluations are validated server-side.
- CSV exports preserve structure and UTF-8 text.
- Administrator pagination works correctly.
- Calendar mutations enforce ownership or division scope.
- Backend tests and frontend build pass.
- Any unavailable database or browser execution is explicitly recorded as blocked.
