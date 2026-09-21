# Frontend Performance Debt Paydown Plan

**Prepared:** September 15, 2026  
**Status:** Proposed  
**Scope:** Frontend loading, heavyweight feature delivery, Face ID startup, caching, and measurable performance gates

## Objective

Reduce the code and model payload required for the first usable screen, make heavyweight features load only when requested, and establish repeatable evidence that attendance scanning performs acceptably on supported mobile devices.

This work must not delay or weaken the open privacy, upload-validation, evaluation-validation, or calendar-authorization fixes. Performance changes should be delivered as isolated pull requests with behavior-preserving regression checks.

## Current Baseline

The September 15 production build succeeds and reports:

| Asset | Minified size | Gzip size | Current delivery behavior |
|---|---:|---:|---|
| Main application JavaScript | 1,766.23 kB | 524.34 kB | Loaded by the application entry point |
| Human Face ID engine | 1,578.72 kB | 423.10 kB | Dynamically imported when face identity starts |
| HTML-to-canvas support | 201.42 kB | 48.03 kB | Separate generated chunk |
| Other generated JavaScript | 172.72 kB | 60.32 kB | Separate generated chunks |
| Local Human model files | 12.81 MB | Not measured over the deployed transport | Loaded as required by Face ID configuration and browser cache state |

Additional findings:

- `frontend/src/App.jsx` statically imports 24 page modules.
- Role-inaccessible and unvisited pages can therefore contribute to the initial dependency graph.
- `@vladmandic/human` is already dynamically imported, which should be preserved.
- `ScanAttendance.jsx` statically reaches MediaPipe and QR scanning dependencies.
- DTR screens statically reach PDF/image rendering dependencies through `DTRPrint.jsx`.
- Both calendar pages statically import FullCalendar.
- MediaPipe WASM and model resources are fetched from third-party origins.
- The service worker caches same-origin scripts, styles, images, fonts, and the manifest, but does not explicitly manage the local Face ID model files or cross-origin MediaPipe resources.
- No frontend automated-test command or recorded cold/warm mobile performance baseline currently exists.

The bundle-size warning is a risk indicator, not proof of a user-visible failure. Cold-load and real-device measurements are required before and after implementation.

## Target Outcomes

1. Login and the authenticated role home screen do not require code for every application page.
2. Face ID, QR, PDF/export, and calendar dependencies load only when their feature is opened.
3. Face initialization exposes clear download, initialization, camera, ready, and recoverable error states.
4. Required model/runtime assets use an intentional versioning and caching policy.
5. A repeatable report records bundle sizes, cold/warm navigation timing, and Face ID readiness on supported devices.
6. Existing backend tests remain green and every frontend production build succeeds throughout the work.

## Implementation Cycle — Required Execution Order

### START HERE — Cycle 1: Measure Before Changing Code

**First task:** `PERF-001 — Capture the cold/warm baseline and add bundle reporting.`

This must be completed first. Without a recorded baseline, later bundle changes cannot demonstrate an improvement and regressions cannot be distinguished from pre-existing behavior.

| Cycle | Work ID | Priority | Required work | Starts after | Exit gate |
|---:|---|---|---|---|---|
| **1 — FIRST** | **PERF-001** | **P0 for this initiative** | Capture bundle, route, Face ID, and device baselines; add non-blocking size reporting | Immediately | Baseline committed and reproducible |
| **2 — SECOND** | **PERF-002** | **P1** | Convert application pages to lazy-loaded route boundaries | PERF-001 | Routes, refreshes, redirects, and build pass; initial bundle decreases |
| **3 — THIRD** | **PERF-003** | **P1** | Isolate Face/QR, DTR/PDF, and calendar dependency graphs | PERF-002 | Heavy chunks are absent from unrelated navigation |
| **4 — FOURTH** | **PERF-004** | **P1** | Add phased Face ID loading, cleanup, pinned asset delivery, and safe model caching | PERF-003 and device access | Cold/warm Face ID and recovery cases pass on Android and iPhone |
| **5 — LAST** | **PERF-005** | **P1 release gate** | Set evidence-based CI budgets and close performance acceptance records | PERF-004 | CI budgets enforced and acceptance evidence approved |

The execution path is:

`PERF-001 Baseline` → `PERF-002 Routes` → `PERF-003 Heavy Features` → `PERF-004 Face Assets` → `PERF-005 Enforcement`

### Cycle Operating Rules

- Complete each cycle's exit gate before starting its dependent cycle.
- Keep one implementation pull request per cycle; do not combine all bundle, routing, and service-worker changes.
- Rebuild and attach a size comparison to every pull request.
- Run affected workflow smoke tests before merging each cycle.
- If a P0/P1 privacy, authorization, upload, or correctness defect conflicts with this work, the release-critical defect takes precedence.
- `PERF-001` measurement work may run alongside unrelated security fixes because it is observational.
- `PERF-002` and later must be rebased after overlapping application-shell, route, Face ID, DTR, or service-worker changes.

### Suggested Cycle Board Labels

Use these labels consistently in issues and pull requests:

- `initiative:performance-paydown`
- `cycle:1-baseline` through `cycle:5-enforcement`
- `priority:perf-p0` for `PERF-001`
- `priority:perf-p1` for `PERF-002` through `PERF-005`
- `area:routing`, `area:face-id`, `area:dtr-export`, `area:calendar`, or `area:pwa-cache`
- `gate:blocked`, `gate:ready`, or `gate:passed`

### First Cycle Checklist — PERF-001

- [ ] Run and save a clean production build report.
- [ ] Add an analyzer or machine-readable build output.
- [ ] Add a warning-only bundle-budget command.
- [ ] Record cold and warm login, admin-home, and intern-home readiness.
- [ ] Record cold and warm Scan Attendance-to-Face-ID-ready timing.
- [ ] Record DTR print/export and calendar feature-load timing.
- [ ] Capture one lower-spec Android result and one supported iPhone result.
- [ ] Commit the baseline under `docs/performance/`.
- [ ] Mark `PERF-001` `gate:passed` before beginning `PERF-002`.

## Delivery Plan

### PR 1 — Establish Measurements and Guardrails

**Purpose:** Create a trustworthy before/after baseline before changing bundle boundaries.

Implementation:

- Add a frontend `analyze` script that produces a visual or machine-readable bundle report.
- Add a lightweight bundle-budget script that reads the built assets and reports initial and lazy-chunk gzip sizes.
- Record cold-cache and warm-cache measurements for:
  - Login to interactive.
  - Admin dashboard to interactive.
  - Intern dashboard to interactive.
  - Opening Scan Attendance to Face ID ready.
  - Opening DTR and initiating print/export.
  - Opening each calendar.
- Test at minimum one lower-spec Android device and one supported iPhone, using both normal Wi-Fi and throttled mobile conditions.
- Record browser version, device, connection profile, cache state, success/failure, and timing.

Acceptance:

- `npm run build` succeeds.
- A versioned baseline report is committed under `docs/performance/`.
- Measurements clearly distinguish JavaScript readiness, model readiness, and camera readiness.
- Budgets initially report warnings only so the baseline itself does not break delivery.

### PR 2 — Route-Level Code Splitting

**Purpose:** Remove unvisited and role-inaccessible pages from the initial application chunk.

Implementation:

- Replace page imports in `frontend/src/App.jsx` with `React.lazy` dynamic imports.
- Preserve eager loading for the smallest application shell components required to authenticate and render navigation.
- Wrap route rendering in a shared `Suspense` boundary using the existing visual language from `SystemLoader` or `LoadingSpinner`.
- Group routes by access path so admin-only, supervisor/intern, legal, and shared pages do not enter unrelated navigation paths.
- Add a route-load error boundary with a retry/reload action for stale deployments or failed chunk requests.
- Do not add `manualChunks` until route boundaries are working and measured; manually splitting vendor code alone does not reduce total work.

Acceptance:

- Direct navigation and refresh work for every existing route.
- Authorization redirects behave exactly as before.
- A failed lazy import presents a recoverable error rather than a blank screen.
- The initial main chunk is materially smaller than the recorded baseline.
- Admin users do not download intern-only page chunks before visiting a shared dependency, and vice versa.

### PR 3 — Heavy Feature Boundaries

**Purpose:** Keep specialized libraries out of ordinary dashboard and record-management navigation.

Implementation:

- Load `ScanAttendance` and its QR/MediaPipe dependency graph only on `/intern/scan`.
- Lazy-load `FaceRegistrationModal` only when registration or renewal is initiated.
- Lazy-load `DTRPrint` and its `jspdf`/DOM-image dependency graph only when DTR output is displayed or export is requested.
- Lazy-load admin and intern calendar pages so FullCalendar is isolated from unrelated routes.
- Add deliberate loading UI at each boundary so the application never appears frozen.
- Verify that closing and reopening a feature reuses the loaded chunk without reinitializing resources unnecessarily.

Acceptance:

- Dashboard and login network traces do not request Face ID, QR, PDF, or calendar chunks.
- DTR calculations and displayed totals remain unchanged.
- QR scanning, Face ID registration/verification, calendar interaction, and DTR printing remain functional.
- No new duplicate model initialization or camera stream remains active after leaving a feature.

### PR 4 — Face ID Startup and Asset Delivery

**Purpose:** Make the heaviest workflow reliable and understandable on mobile devices.

Implementation:

- Introduce explicit startup phases: preparing runtime, loading models, warming engine, requesting camera, and ready.
- Surface actionable errors for offline resources, camera denial, unsupported WebGL, CPU fallback, and model initialization failure.
- Add cancellation/cleanup using component lifecycle and `AbortController` where supported so navigation does not leave obsolete downloads or camera work active.
- Decide and document whether MediaPipe WASM/models will remain third-party hosted or be pinned and served from the application origin.
- Prefer same-origin, version-pinned assets if deployment storage and bandwidth allow; this makes cache behavior and offline support controllable.
- Version model caches separately from the application shell so model updates do not invalidate unrelated assets.
- Cache only public immutable model/runtime assets; never cache biometric descriptors, camera captures, authenticated API responses, or uploaded documents.
- Confirm whether all enabled Human models are required for the approved identity policy before removing or deferring any model.

Acceptance:

- First-run users always see progress or a recoverable error during model initialization.
- Warm-cache Face ID startup is measurably faster than cold-cache startup.
- Leaving the Face ID screen releases the camera and does not continue visible background work.
- Face recognition, liveness, and anti-spoof acceptance behavior is unchanged unless a separately approved security review authorizes a model/configuration change.
- A version update invalidates only the affected runtime/model cache.

### PR 5 — Enforce Budgets and Finish Device Acceptance

**Purpose:** Prevent performance debt from silently returning.

Implementation:

- Compare final cold/warm measurements against the baseline.
- Agree on supported-device thresholds based on collected evidence, then convert bundle and timing warnings into CI failures.
- Suggested initial bundle guardrails for discussion:
  - Initial application JavaScript: no regression above the post-splitting baseline.
  - Any new route chunk over 500 kB minified: explicit review required.
  - Any single change increasing initial gzip JavaScript by more than 25 kB: explicit review required.
- Record p50 and worst observed values for route readiness and Face ID readiness; do not report only the fastest run.
- Complete the mobile-camera acceptance cases already listed in `docs/week-6/ACCEPTANCE_MATRIX.md`.
- Update the Week 6 defect register and acceptance matrix with fresh evidence instead of leaving outdated static findings in place.

Acceptance:

- CI detects an intentional test violation of each enforced budget.
- Android and iPhone cold/warm results are documented.
- Face ID permission denial, camera switching, rotation, background/resume, CPU fallback, and retry flows are recorded.
- No P0/P1 security or correctness regression is introduced.

## Recommended Pull Request Order

| Order | Change | Risk | Dependency |
|---:|---|---|---|
| 1 | Measurement and reporting | Low | None |
| 2 | Route-level lazy loading | Medium | Baseline captured |
| 3 | Face/QR, DTR, and calendar boundaries | Medium | Route boundaries stable |
| 4 | Face startup and asset caching | High | Device environment available |
| 5 | Enforced budgets and final acceptance | Low | Final measurements captured |

PRs 1–3 can proceed without changing face-matching rules. PR 4 must not weaken liveness, anti-spoofing, descriptor quality, or enrollment security merely to improve speed.

## Verification Checklist for Every PR

- [ ] `cd backend && npm test` passes.
- [ ] `cd frontend && npm run build` passes.
- [ ] Login, logout, legal acceptance, and role redirects work.
- [ ] Direct URL refresh works for affected routes.
- [ ] No authenticated API response or biometric information enters a browser cache.
- [ ] Loading and error states are visible and recoverable.
- [ ] Bundle report is attached and compared with the preceding baseline.
- [ ] Relevant desktop and mobile smoke cases pass.

## Definition of Done

Performance debt paydown is complete when:

- Route and heavy-feature code is delivered on demand.
- Initial JavaScript size is reduced and protected by an agreed CI budget.
- Face ID cold/warm readiness is measured on supported Android and iPhone devices.
- Model/runtime hosting, versioning, and caching behavior is documented and tested.
- Camera and model failures have recoverable user-facing states.
- Performance work introduces no security, authorization, attendance, DTR, or report regression.
- The defect register and acceptance matrix reflect current evidence.
