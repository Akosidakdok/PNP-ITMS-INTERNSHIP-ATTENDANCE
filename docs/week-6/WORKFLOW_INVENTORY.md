# Week 6 Workflow Inventory

**Prepared:** August 25, 2026  
**Source of truth inspected:** `frontend/src/App.jsx`, administrator/intern page components, `backend/src/index.js`, middleware, authorization helpers, data services, and project services.

## Role Definitions

| Role | Application Area | Intended Scope |
|---|---|---|
| Administrator | `/admin/*` | System-wide administration and reporting |
| Supervisor | `/admin/*` | Assigned-division operations; administrator-only master data and supervisor management are denied |
| Intern | `/intern/*` | Own profile, attendance, DTR, documents, evaluation, calendar, and authorized projects |

## Authentication and Shared Workflows

| Workflow | Frontend | Backend | Expected Permission |
|---|---|---|---|
| Login | `/login` | `POST /auth/login` | Public; requires username and password |
| Current session | Protected route | `GET /auth/me` | Any authenticated account |
| Change password | Profile | `POST /auth/change-password` | Current authenticated account only |
| Notifications | Navbar/dashboard | `GET /notifications` | Recipient-scoped |
| Mark notification read | Navbar/dashboard | `PATCH /notifications/:id/read` | Recipient-scoped |
| Mark all notifications read | Navbar/dashboard | `PATCH /notifications/read-all` | Current recipient only |
| Profile | `/admin/profile`, `/intern/profile` | Intern self-profile endpoints and session data | Own account; intern editable fields are allow-listed |

## Administrator Workflows

| Area | Frontend Route | Primary API Operations | Expected Result |
|---|---|---|---|
| Dashboard | `/admin` | `GET /admin/dashboard-stats`, QR endpoints | System-wide totals, recent activity, and active QR code |
| Intern management | `/admin/interns` | `GET/POST /interns`, `GET/PUT/DELETE /interns/:id`, password reset, Face ID staff enrollment | Full intern lifecycle with validated fields |
| Supervisor management | `/admin/supervisors` | `GET/POST /supervisors`, `GET/PUT/DELETE /supervisors/:id`, password reset | Administrator-only supervisor lifecycle |
| Divisions | `/admin/divisions` | Division and department CRUD | Administrator-only mutation; authenticated read |
| Schools | `/admin/schools` | School CRUD | Administrator-only mutation; authenticated read |
| Attendance | `/admin/attendance` | Attendance log listing and approval/rejection | Paginated review with photo preview and durable status changes |
| DTR | `/admin/dtr` | Intern list, per-intern DTR, single and bulk overrides | Correct Manila-time calculations and validated overrides |
| Documents | `/admin/documents` | Document list and status update | Search/filter/review with authorized signed preview |
| Evaluations | `/admin/evaluations` | Evaluation list, create, update, visibility change | Validated scores, exact weighted total, controlled release |
| Face ID renewal | Intern-management dialogs | Renewal request list/review/dismissal, enrollment history, staff registration | Audited, reasoned renewal workflow |
| Projects | `/admin/projects` | Project list, stats, detail, create/update/delete, file operations, archive/restore, audit | System-wide project administration under service authorization |
| Reports | `/admin/reports` | Attendance report endpoint | Accurate filtered results and safe UTF-8 CSV export |
| Calendar | `/admin/calendar` | Calendar event CRUD | Authenticated read; staff mutation according to policy |

## Supervisor Workflows

| Area | Frontend Route | Primary API Operations | Expected Scope |
|---|---|---|---|
| Dashboard | `/admin` | `GET /supervisor/dashboard-stats` | Assigned division only |
| Intern management | `/admin/interns` | Intern list and mutations | Assigned division only; division cannot be reassigned by supervisor |
| Attendance | `/admin/attendance` | List, approve, reject | Assigned division only |
| DTR | `/admin/dtr` | View and override | Assigned division only |
| Documents | `/admin/documents` | List, preview, review, delete | Assigned division only |
| Evaluations | `/admin/evaluations` | List, create, and permitted update operations | Assigned division only; exact mutation policy requires acceptance confirmation |
| Face ID | Intern-management dialogs | Renewal review and staff enrollment | Assigned division only |
| Projects | `/admin/projects` | Scoped project operations | Assigned division and project access flags |
| Reports | `/admin/reports` | Attendance report | Assigned division enforced by backend |
| Calendar | `/admin/calendar` | Calendar CRUD | Shared calendar; mutation ownership policy requires acceptance confirmation |
| Administrator-only pages | `/admin/supervisors`, `/admin/divisions`, `/admin/schools` | Administrator-only endpoints | Redirected or rejected with HTTP 403 |

## Intern Workflows

| Area | Frontend Route | Primary API Operations | Expected Scope |
|---|---|---|---|
| Dashboard | `/intern` | Own profile/DTR/notifications summary | Current intern only |
| Attendance scan | `/intern/scan` | Next scan, QR validation, attendance scan | Current active intern; valid QR plus live matching face |
| One-time Face ID | Dashboard/scan flow | Face enrollment status and registration | One eligible self-enrollment, consumed atomically |
| Face renewal | Dashboard/scan flow | Renewal request and approved renewal | Current intern and one approved request only |
| DTR | `/intern/dtr` | `GET /dtr` | Current intern only |
| Documents | `/intern/documents` | Own list, upload, delete | Current intern only; validated document inputs |
| Evaluation | `/intern/evaluation` | `GET /evaluations` | Current intern and released evaluations only |
| Projects | `/intern/projects` | Authorized project and file operations | Leader/member/contributor permissions |
| Calendar | `/intern/calendar` | Calendar event listing | Read-only shared calendar |
| Profile | `/intern/profile` | Own profile read/update | Only allow-listed contact and emergency fields |

## Backend Permission Matrix

| Capability | Administrator | Supervisor | Intern |
|---|---:|---:|---:|
| Administrator dashboard | Allow | Deny | Deny |
| Supervisor dashboard | Deny | Allow, own division | Deny |
| Manage supervisors | Allow | Deny | Deny |
| Mutate divisions/schools | Allow | Deny | Deny |
| Read intern list | All interns | Own division | Deny |
| Mutate intern | All interns | Own division | Own allow-listed profile fields only |
| Review attendance/DTR/documents | All interns | Own division | Own records only where applicable |
| Evaluate intern | All interns | Own division under current API | View own released result |
| Staff Face ID operations | All interns | Own division | Deny |
| One-time self Face ID enrollment | Deny | Deny | Eligible current intern only |
| Projects | Full authorized staff access | Division/project scoped | Leader/member/contributor scoped |
| Reports | All divisions | Own division | Deny |
| Notifications | Own recipient records | Own recipient records | Own recipient records |

## Static Authorization Findings

- All business API routes except login and health endpoints require `authMiddleware`.
- Administrator dashboard, supervisor management, and division/school mutations use administrator-only middleware.
- Intern, attendance, DTR, document, evaluation, Face ID, and project staff routes contain supervisor-scope helpers where expected.
- Project authorization has passing automated regression coverage.
- Calendar event update/delete operations do not enforce creator ownership or division scope.
- Notification helpers treat administrators and supervisors as global notification readers/updaters instead of recipient-scoped users.
- The evaluation wrapper supplies a supervisor `readOnly` flag, but the evaluation component ignores that property. The current component and API allow more supervisor mutations than the wrapper name implies.

## Inventory Completion

- [x] Frontend protected routes inventoried
- [x] Backend HTTP routes inventoried
- [x] Administrator-only boundaries identified
- [x] Supervisor division checks traced
- [x] Intern self-service routes traced
- [x] Project access model traced to existing automated tests
- [ ] Authenticated administrator workflows executed interactively
- [ ] Authenticated supervisor workflows executed interactively
- [ ] Authenticated intern workflows executed interactively

The unchecked items are blocked by the database health failure and unavailable browser connection recorded in the environment checklist.

