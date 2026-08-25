# Week 6 Audit Baseline

**Audit dates:** August 24–25, 2026  
**Focus:** Full System Audit and Acceptance Definition  
**Repository branch:** `main`  
**Baseline commit:** `fe4c36425578932896432177ff3e1929371151c4`

## Scope

This baseline covers the administrator, supervisor, and intern route inventory; the local build and automated-test state; environment readiness; administrator authorization boundaries; and the initial static audit of attendance, DTR, Face ID, documents, evaluations, projects, reports, notifications, pagination, validation, encoding, and loading behavior.

No production records, credentials, access tokens, biometric data, or account details were written to the repository during this audit.

## Verification Results

| Check | Result | Evidence |
|---|---|---|
| Backend automated tests | **Pass** | `npm.cmd test` completed with 19 tests passed and 0 failed. |
| Frontend production build | **Pass with warning** | `npm.cmd run build` completed successfully. Vite warned that two generated JavaScript chunks exceed 500 kB. |
| Backend root endpoint | **Pass** | `GET /` returned HTTP 200. |
| Empty login validation | **Pass** | `POST /auth/login` with an empty JSON object returned HTTP 400. |
| Unauthenticated administrator boundary | **Pass** | `GET /admin/dashboard-stats` without a bearer token returned HTTP 401. |
| Database health | **Blocked** | `GET /ping` returned HTTP 503 because the configured Supabase database was unavailable. The check was repeated with network access and produced the same result. |
| Interactive browser audit | **Blocked** | No in-app browser, Chrome, or Edge connection was available to the browser-control runtime. |
| UTF-8 source scan | **Pass** | A UTF-8-aware scan found no common mojibake sequences in frontend or backend JavaScript/JSX source. En dashes and em dashes are correctly encoded in source files. |

## Existing Automated Coverage

The 19 passing backend tests cover:

- Login and Face ID attempt lockouts
- Retry timing and lockout thresholds
- Administrator bypass and supervisor division isolation
- Intern, evaluation, DTR, and project authorization helpers
- Project leader, member, contributor, and supervisor permissions
- Private project deliverables and signed storage access
- One-time self Face ID enrollment and enrollment migration rules

## Coverage Gaps

- The frontend has no automated test command or browser workflow suite.
- Attendance and DTR calculations are not covered by automated tests.
- Document validation and upload limits are not covered by automated tests.
- Evaluation range validation is not covered by automated tests.
- Notifications are not covered by recipient-isolation tests.
- Reports and CSV encoding are not covered by automated tests.
- Pagination behavior is not covered by component or end-to-end tests.
- Mobile camera behavior requires physical Android and iPhone testing.

## Environment Summary

The required environment files exist locally. Only variable names were inspected:

- Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, and `PORT`
- Frontend: `VITE_API_BASE_URL`

Environment values were not printed or copied into audit files.

## Build Performance Risk

The frontend build succeeds, but the generated application and Face ID bundles are large:

- Main application chunk: approximately 1.74 MB before gzip
- Face model/runtime chunk: approximately 1.58 MB before gzip

This is recorded as a mobile loading risk, not as a confirmed runtime failure. Device testing and network throttling are required before assigning a higher severity.

## Audit Disposition

- **August 24 baseline:** Complete.
- **August 24 workflow inventory:** Complete by frontend route and backend endpoint trace.
- **August 25 acceptance definition:** Complete in `ACCEPTANCE_MATRIX.md`.
- **August 25 administrator static/API audit:** Complete for source, automated tests, build, and unauthenticated boundaries.
- **August 25 authenticated interactive audit:** Blocked by database health and browser availability; cases remain explicitly marked `Blocked`.

## Related Artifacts

- [Workflow Inventory](./WORKFLOW_INVENTORY.md)
- [Environment Checklist](./ENVIRONMENT_CHECKLIST.md)
- [Acceptance Matrix](./ACCEPTANCE_MATRIX.md)
- [Defect Register](./DEFECT_REGISTER.md)

