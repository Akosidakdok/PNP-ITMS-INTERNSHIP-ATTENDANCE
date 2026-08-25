# Week 6 Implementation Plan — August 24–30, 2026

**Focus:** Full System Audit and Acceptance Definition  
**Status:** In Progress

## Week Exit Criteria

Week 6 is complete when:

- [ ] Every administrator, supervisor, and intern critical workflow has been tested.
- [ ] 100% of critical-path tests pass, and at least 95% of the full regression suite passes.
- [ ] Zero open P0/blocking or P1/critical defects remain.
- [ ] Pagination, validation, UTF-8 text, loading states, and mobile-camera issues pass regression testing.
- [ ] Acceptance results and any deferred P2/P3 defects are documented and approved.

## Current Baseline

- Backend automated tests: **19/19 passing**.
- Frontend production build: **passing**.
- Existing automated tests cover authorization, lockouts, project permissions, and Face ID enrollment.
- UTF-8-aware source scan: **passing**. Earlier mojibake observed in PowerShell output was a shell decoding issue, not corrupted source text.
- Database health check: **blocked** because `/ping` returns HTTP 503 for the configured Supabase environment.
- Interactive browser audit: **blocked** because no browser connection is available in the current session.
- Confirmed audit findings include DTR/attendance model inconsistency, global staff notification access, missing upload/evaluation validation, report CSV defects, stale loading states, and incomplete pagination.

## Daily Schedule

| Date | Main Work | Required Output | Status |
|---|---|---|---|
| **Mon, Aug 24** | Establish baseline; inventory screens, APIs, roles, test accounts, and devices | Workflow inventory, environment checklist, initial defect register | ✅ **Complete** |
| **Tue, Aug 25** | Define acceptance criteria and prepare repeatable test data; begin administrator audit | Acceptance matrix, test cases, administrator findings | ✅ **Complete** |
| **Wed, Aug 26** | Complete administrator workflows; fix pagination, encoding, and validation blockers | Administrator workflows passing; pagination and UTF-8 regression evidence | Pending |
| **Thu, Aug 27** | Test supervisor scope and permissions; fix loading and error-state defects | Supervisor workflows passing; authorization and asynchronous-state evidence | Pending |
| **Fri, Aug 28** | Test the complete intern journey on desktop and physical mobile devices, emphasizing Face ID and attendance | Mobile-camera compatibility matrix; intern workflow results | Pending |
| **Sat, Aug 29** | Resolve remaining P0/P1 defects; run cross-module regression for DTR, projects, reports, and notifications | Zero open blockers; full regression report | Pending |
| **Sun, Aug 30** | Run final acceptance, production build, defect triage, and stakeholder sign-off | Signed acceptance checklist and deferred-defect register | Pending |

## August 24–25 Completion Checklist

- [x] Establish the repository, automated-test, build, API, and environment baseline.
- [x] Inventory administrator, supervisor, and intern workflows.
- [x] Map frontend routes, backend endpoints, and role permissions.
- [x] Prepare the test-account, data, browser, camera, and device checklist.
- [x] Define measurable acceptance criteria and traceable test IDs.
- [x] Perform the available administrator static and API boundary audit.
- [x] Create and prioritize the evidence-backed defect register.
- [x] Rerun all 19 backend tests successfully.
- [x] Rerun the frontend production build successfully.
- [x] Verify the audit Markdown files contain valid UTF-8 text.
- [ ] Execute physical Android and iPhone camera tests. **Scheduled for August 28.**

**Carryover to August 26:** Complete the authenticated administrator browser workflows after Supabase health and browser connectivity are restored.

### Completed Artifacts

- [x] [Audit Baseline](./docs/week-6/AUDIT_BASELINE.md)
- [x] [Workflow Inventory](./docs/week-6/WORKFLOW_INVENTORY.md)
- [x] [Environment Checklist](./docs/week-6/ENVIRONMENT_CHECKLIST.md)
- [x] [Acceptance Matrix](./docs/week-6/ACCEPTANCE_MATRIX.md)
- [x] [Defect Register](./docs/week-6/DEFECT_REGISTER.md)

## Role Workflow Coverage

### Administrator

Test login, dashboard, division and school management, supervisor and intern management, attendance approval, DTR viewing and overrides, Face ID renewal requests, document review, evaluations, projects, reports, calendar, notifications, and profile management.

### Supervisor

Verify division-scoped dashboard and intern visibility, attendance actions, DTR access, document review, evaluation read-only behavior, project access, reports, calendar, notifications, and denial of administrator-only screens.

### Intern

Test first login, one-time Face ID enrollment, QR and Face ID attendance, DTR totals, document upload, replacement and deletion, released evaluations, assigned projects and deliverables, calendar, notifications, and profile updates.

## Measurable Acceptance Criteria

| Area | Acceptance Definition |
|---|---|
| **Attendance** | A valid QR code plus a verified live face records exactly one expected event. Duplicate and out-of-order scans are rejected. Timestamps and attendance status are correct. Supervisors see only their division. Approval or rejection updates the DTR immediately. |
| **DTR** | Daily time-in/out, breaks, rendered hours, monthly totals, and required or remaining hours match independently calculated values. Overrides require valid input and persist correctly. Print and export output matches the displayed period. |
| **Face ID** | Eligible interns enroll once, and unauthorized renewal is rejected. There are no false acceptances in at least 20 controlled impostor attempts. Valid users succeed within three attempts in at least 90% of trials. Permission denial, camera switching, rotation, background/resume, and retry all recover without refreshing. |
| **Documents** | Required document type, file type, and size are validated on the client and server. Upload progress prevents duplicate submission. Preview and download work. Review status and remarks reach the correct intern. Unauthorized users cannot access another intern's file. |
| **Evaluations** | Scores remain within allowed ranges. The weighted total is reproducible and correctly rounded. Save and edit actions persist all fields. Unreleased evaluations remain hidden. Released evaluations display identically to the saved administrator record. |
| **Projects** | Only authorized staff, leaders, members, and contributors can view or mutate permitted data. Progress and membership persist. Upload, delete, archive, and restore rules are enforced. Every privileged mutation produces an audit entry. |
| **Reports** | Month, year, and division filters return the same totals as the source attendance and DTR data. CSV files open with intact UTF-8 names and correct columns. Empty results are handled without errors. |
| **Notifications** | Each qualifying action creates one notification for the correct recipient. Unread counts match. Read and read-all actions persist after reload. Users cannot read or update another user's notification. |

## Cross-Cutting Blocker Acceptance

### Pagination

Test with 0, 1, page-size, page-size + 1, and 100+ records. First, previous, next, and last controls must return the correct non-duplicated records and preserve active filters.

### Validation

Required fields, formats, ranges, duplicate records, oversized uploads, and invalid API payloads must produce field-specific messages without partial writes.

### Text Encoding

All UI, PDF and print output, database content, email, and CSV content must use UTF-8 with no mojibake, replacement characters, or corrupted Filipino names.

### Loading States

Every asynchronous action must display feedback within 200 ms, prevent duplicate submission, and always settle into a success, empty, retryable-error, or timeout state.

### Mobile Camera

Validate on at least one Android Chrome device and one iPhone Safari device in portrait and landscape, including permission denial and regrant, camera switching, and application background/resume.

## Defect Management

Each defect must record:

- Module and affected role
- Environment, browser, and device
- Reproduction steps
- Expected and actual results
- Screenshot, video, or relevant log
- Severity and owner
- Fix or pull-request reference
- Regression-test result

### Priority Definitions

- **P0 — Blocker:** Security or data exposure, data loss, or attendance cannot be recorded. Fix immediately.
- **P1 — Critical:** A core workflow cannot be completed without a practical workaround. Resolve within 24 hours and before acceptance.
- **P2 — Major:** Incorrect secondary behavior with a workaround. Fix this week when regression risk permits; otherwise document it for Week 7.
- **P3 — Minor:** Cosmetic or low-impact usability issue. Defer only with explicit approval.

## Final Acceptance Gate

The Sunday acceptance gate requires:

- All 19 existing backend tests passing
- All new critical workflow checks passing
- Frontend production build passing
- Zero open P0 or P1 defects
- Acceptance checklist reviewed and approved
- Deferred P2 and P3 defects assigned an owner and target date
