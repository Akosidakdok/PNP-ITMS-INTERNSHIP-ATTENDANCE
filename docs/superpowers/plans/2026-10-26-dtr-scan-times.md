# DTR scan times implementation plan

**Goal:** Apply the supplied 08:00 time-in floor and 17:00 time-out cap in Philippine time, preserving raw scan timestamps and second precision.

**Architecture:** Reuse `actual_scan_time` / `recorded_scan_time` and `actual_time_*` / `recorded_time_*`. New logs keep `scan_time` raw for scan ordering and duplicate prevention. Official API responses and DTR aggregation use the recorded value. Existing explicit recorded values, custom schedules, and manual corrections retain their established behavior; unprocessed legacy rows use the standard rule. No historical database rewrite is required.

**Tech stack:** Existing Node.js, Supabase, React, and node:test.

**Spec:** User's DTR time-recording requirements in this chat.

## Constraints and review focus

- Compare full timestamps, including seconds/milliseconds, against the same Philippine calendar day's boundaries.
- Preserve raw scans; never fall back to saving only a processed scan if audit columns are unavailable.
- Preserve custom schedules and manual edits, including dates changed by an administrator.
- Pair scans using their original ordering even when processing reverses/equalizes displayed times.
- Share official values across history, DTRs, report totals, print/PDF/image exports; keep existing lunch and approval rules.

## Tasks

- [x] Add failing boundary tests to `backend/test/attendanceTime.test.js`, DTR integration tests to `backend/test/dtrRecords.test.js`, and scan persistence/read-path tests.
- [x] Add `processDtrScanTime(value, scanType)` and an official log projection; apply them to scanning and `backend/src/data.js` reads, preserving custom schedules/manual edits.
- [x] Add failing formatter tests, then share seconds-aware formatting between DTR table and preview; allow existing time-edit controls to accept seconds.
- [x] Run backend/frontend suites and frontend build, review the diff and database payloads, and record any deployment limitations.

## Execution notes

- Baseline: backend 105 tests and frontend 15 tests pass.
- Work in the current clean checkout; no live database mutation or deployment is needed.
- User confirmed custom schedules and manual corrections remain exceptions. The seeded Regular 8AM–5PM profile (including a hyphen spelling) and unassigned scans use the new rules. Other named profiles retain their existing override behavior.
- Independent review findings fixed and covered: same-day edit scan ordering, mixed real/manual pairs after date moves, precision loss when opening attendance previews, and both sides of custom schedule synchronization.
- Final checks: 150 backend tests pass with TZ=UTC; 19 frontend tests pass with TZ=America/Los_Angeles, including rendering the real DTR print/export table. Vite production build passes with its existing large-chunk warning. `git diff --check` passes.
- Persistence was verified using database-boundary mocks; no live database or production deployment was changed. Existing audit columns from `backend/db/migration_superadmin_attendance_control.sql` are required. Existing explicit recorded values are retained; historical rows were not rewritten.
