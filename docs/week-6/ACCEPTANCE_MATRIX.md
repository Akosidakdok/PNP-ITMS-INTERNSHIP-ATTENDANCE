# Week 6 Acceptance Matrix

**Defined:** August 25, 2026  
**Execution labels:** `Pass — automated`, `Pass — static`, `Fail — static`, `Blocked — environment`, and `Not run — device`.

Static results verify code paths and constraints but do not replace authenticated or physical-device execution.

## Authentication and Administrator Boundaries

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| AUTH-001 | Submit login without username/password | HTTP 400 with a field-relevant error; no session created | **Pass — API smoke** |
| AUTH-002 | Request a protected administrator endpoint without a token | HTTP 401; no protected data returned | **Pass — API smoke** |
| AUTH-003 | Use an intern token on `/admin/*` | Frontend redirects to `/intern`; backend mutations return HTTP 403 | **Pass — static** |
| AUTH-004 | Use a supervisor on administrator-only supervisor/master-data operations | Frontend denies route; backend returns HTTP 403 | **Pass — static** |
| AUTH-005 | Lockout after repeated invalid login | Approved attempt threshold and Retry-After metadata are enforced | **Pass — automated** |

## Attendance

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| ATT-001 | Load attendance list with 0, 1, 15, 16, and 100+ records | Correct total and non-duplicated pages; page remains within valid range | **Fail — static:** filters do not reset the current page |
| ATT-002 | Approve a pending attendance record | Exactly one scoped record becomes approved and appears in DTR/report calculations | **Blocked — environment** |
| ATT-003 | Reject a pending attendance record | Exactly one scoped record becomes rejected; remarks persist | **Blocked — environment** |
| ATT-004 | Submit an invalid action path | HTTP 400; no record changes | **Pass — static** |
| ATT-005 | Supervisor targets an intern outside the assigned division | HTTP 403; no record or photo is disclosed | **Pass — automated/static** |
| ATT-006 | Duplicate scan within 10 seconds | Second scan is rejected and only one attendance row is created | **Pass — static; execution blocked** |
| ATT-007 | Complete the allowed daily scan sequence | UI, scan API, DTR, and report use one consistent scan model | **Fail — static:** two-scan attendance and four-scan DTR calculations conflict |

## DTR

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| DTR-001 | Time In before 08:00 and Time Out after 17:00 | Daily credited hours equal the approved business rule and include the afternoon period | **Fail — static:** two scans are interpreted as morning-only by DTR logic |
| DTR-002 | Apply suspended/excused/custom-hours override | One deterministic override is stored with type, hours, and remarks | **Blocked — environment** |
| DTR-003 | Clear an existing override | Previous override no longer affects DTR; refresh remains cleared | **Fail — static:** clear inserts a `NONE` row while the prior override remains discoverable |
| DTR-004 | Send hours below 0 or above 24 directly to API | HTTP 400; no override row created | **Fail — static:** backend has no range or allowed-type validation |
| DTR-005 | Supervisor requests another division's DTR | HTTP 403 with no record disclosure | **Pass — automated/static** |
| DTR-006 | Print a selected month | Printed rows and totals exactly match the displayed month and intern | **Blocked — environment** |

## Face ID

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| FID-001 | Eligible fresh intern enrolls once | First valid enrollment succeeds; the grant is consumed atomically | **Pass — automated** |
| FID-002 | Legacy/ineligible intern self-enrolls | HTTP 409/403; stored face remains unchanged | **Pass — automated/static** |
| FID-003 | Supervisor enrolls an intern outside the assigned division | HTTP 403; no biometric data changes | **Pass — automated/static** |
| FID-004 | Controlled impostor attempts | Zero false acceptances in at least 20 attempts | **Not run — device** |
| FID-005 | Valid-user trials | At least 90% succeed within three attempts across the approved device matrix | **Not run — device** |
| FID-006 | Permission denial, camera switch, rotation, background/resume | Clear recovery path works without a full page refresh | **Not run — device** |

## Documents

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| DOC-001 | Upload missing document type, unsupported type, empty file, and oversized file | Client and server reject each case with HTTP 400/413; no storage/database residue | **Fail — static:** server accepts unbounded memory upload and lacks type/size/document-type checks |
| DOC-002 | Review document inside authorized scope | Status and remarks persist; correct intern sees the result | **Blocked — environment** |
| DOC-003 | Supervisor targets another division's document | HTTP 403 and no signed URL or metadata disclosure | **Pass — automated/static** |
| DOC-004 | List more records than one page | Server returns total/page metadata; controls navigate without loading all signed URLs | **Fail — static:** list is unpaginated and UI uses a no-op pager |
| DOC-005 | Open a document preview | A short-lived authorized signed URL is used; expired URL fails safely | **Pass — static; execution blocked** |

## Evaluations

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| EVAL-001 | Submit every score at 0 and 100 | Stored weighted total equals the independently calculated total and rating boundary | **Blocked — environment** |
| EVAL-002 | Submit scores below 0, above 100, missing required values, or arbitrary columns directly to API | HTTP 400; no evaluation is created or altered | **Fail — static:** payloads are spread into insert/update without server validation or database score constraints |
| EVAL-003 | Intern requests evaluations | Only the current intern's evaluations are returned; UI shows only explicitly released records | **Pass — static; execution blocked** |
| EVAL-004 | Supervisor targets another division's evaluation | HTTP 403 and no mutation | **Pass — automated/static** |
| EVAL-005 | Supervisor opens evaluation page | Permitted create/edit/release operations match a single documented business rule | **Fail — static:** wrapper says read-only while component/API expose mutations |
| EVAL-006 | List more than 100 evaluations/interns | All eligible records remain reachable through real pagination/search | **Fail — static:** evaluation table and intern selector are capped/unpaginated |

## Projects

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| PRJ-001 | Leader/member/unrelated intern mutations | Only the operations allowed by access flags succeed | **Pass — automated** |
| PRJ-002 | Supervisor accesses another division's project | Read/mutation denied unless separately authorized | **Pass — automated/static** |
| PRJ-003 | Upload or delete project deliverable | Private signed access is used; deletion validates project and uploader | **Pass — automated/static** |
| PRJ-004 | Archive/restore project | State changes persist and audit entry records actor/action | **Pass — static; execution blocked** |

## Reports

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| RPT-001 | Generate by month/year/division | Results match source DTR and approved attendance totals | **Fail — static dependency:** current DTR calculation is inconsistent with the attendance scan model |
| RPT-002 | Export names containing commas, quotes, `Ñ`, and dashes | CSV preserves columns and UTF-8 characters in Excel and standards-compliant readers | **Fail — static:** fields are not CSV-escaped and no UTF-8 BOM is added |
| RPT-003 | Report request fails after filters change | Old results are cleared or clearly labeled stale and cannot be exported as the new period | **Fail — static:** prior result remains under current filter/filename |
| RPT-004 | Supervisor selects another division | Backend ignores requested division and enforces assigned division | **Pass — static** |

## Notifications

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| NOT-001 | Each role retrieves notifications | Only rows where `user_id` equals the authenticated account are returned | **Fail — static:** administrators and supervisors receive the global table |
| NOT-002 | Staff marks a notification/read-all | Only the authenticated recipient's rows change | **Fail — static:** staff updates are global, including read-all |
| NOT-003 | Face renewal is approved/rejected | Exactly one notification is created for the requesting intern | **Pass — static; execution blocked** |
| NOT-004 | Reload after read/read-all | Unread count and read flags persist consistently | **Blocked — environment** |

## Calendar

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| CAL-001 | Intern mutates an event | HTTP 403; event remains unchanged | **Pass — static** |
| CAL-002 | Supervisor updates/deletes another supervisor's or division's event | Operation follows an explicit ownership/division rule | **Fail — static:** no resource ownership or division check exists |

## Cross-Cutting Quality

| ID | Test | Measurable Acceptance Result | Current Result |
|---|---|---|---|
| ENC-001 | Scan JS/JSX sources as UTF-8 | No mojibake or replacement characters | **Pass — static** |
| ENC-002 | CSV/document output with Filipino names | Output preserves characters across Excel, preview, print, and download | **Fail/Blocked:** CSV code fails static criteria; other formats need execution |
| LOAD-001 | Every async screen enters and exits loading | Feedback appears promptly; duplicate submission is disabled; success/error/empty states are distinct | **Partial — static:** most mutations disable buttons, but stale-data paths remain |
| LOAD-002 | Cold-load mobile Face ID assets | User receives progress/error feedback and can retry; acceptable time is confirmed on throttled mobile network | **Not run — device** |
| PAG-001 | Change filters while on a later page | Page resets to 1 and displays matching records | **Fail — static** for attendance; pass for intern/supervisor search controls |

## August 25 Summary

- Automated and static evidence confirms several authentication, role-scope, Face ID enrollment, and project authorization cases.
- Static inspection identifies blocking failures in DTR calculations, notifications, document/evaluation validation, reports, calendar authorization, and pagination.
- Data-backed administrator interaction remains blocked by database health and browser availability.
- Physical mobile Face ID cases remain not run.

No blocked or static-only case is treated as fully accepted.
