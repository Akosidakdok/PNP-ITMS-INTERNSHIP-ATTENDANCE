# Restore DTR Overtime

**Goal:** Restore overtime totals while excluding 12:00–13:00, per the user's final clarification. An approved 08:00–20:00 day counts as 11 hours; 08:00–19:00 counts as 10 hours. Apply the same calculation to DTRs, exports, reports, and cumulative intern totals.

**Evidence:** The calculator clips both endpoints to 08:00–17:00 and excludes lunch. The override builder/API/UI additionally cap custom credits at eight hours. Read-only database checks found six saved overtime departures, including the reported September 24 19:00 departure; the recorded timestamps remain intact. No default-capped historical departure candidates were found in the 252 saved departure rows checked.

**Approach:** Count the interval between saved official times minus only its overlap with 12:00–13:00. Keep overtime uncapped, original QR evidence, and explicitly assigned schedules. Preserve late default departures on future scans. Keep manually recorded times authoritative, allow daily custom credits through 24 hours, and retain the fixed eight-hour Excused policy.

- [x] Add failing overtime calculation, aggregation, custom-credit, persistence, and export tests.
- [x] Remove calculation and custom-credit caps; preserve future late default departures and explicit manual times.
- [x] Update expectations that encoded the superseded eight-hour/lunch policy and correct preset labels/input bounds.
- [x] Run tests/build and review. Re-read the six existing overtime records with corrected totals and verify saved times remain unchanged.
- [x] Restart the local backend. On the follow-up, stopping the exact task-owned process and starting the backend separately succeeded; port 3000 returned healthy.

No production attendance rows or audit evidence will be rewritten to restore these totals.

## Verification

- 316 backend tests and 29 frontend tests passed; production build passed.
- Initial read-only verification before the lunch clarification confirmed six saved overtime departures were intact. The final rule deducts lunch only: 08:00–20:00 is 11 hours and 08:00–19:00 is 10 hours. No stored clocks were changed by this fix.
- Schedule previews exclude the same lunch overlap. All four numeric override types validate a maximum of 24 hours per date, and configured schedule clocks are preserved.
- Independent review findings were fixed and re-reviewed with no remaining actionable issues.
- No new SQL migration or attendance data rewrite is required for overtime restoration.
- Verified the user's live Brave tab at `http://localhost:5173/admin/dtr` after restart and reload. Restored the same intern/September filters and selected date. The actual 09/24/2026 row visibly shows 08:00 AM–07:00 PM, `11h 00m`, Approved. Saved screenshot proof outside the repository in the chat's visualization directory.
- Final lunch clarification verification supersedes the preceding full-span example: restarted the local backend, then verified the user's now-saved 09/24/2026 08:00 AM–08:00 PM row shows `11h 00m`, Approved in the actual browser. Ordinary 08:00–17:00 rows show `8h 00m`. Saved proof as `dtr-lunch-excluded-verified.png` in the chat's visualization directory. All 316 backend and 29 frontend tests and the production build pass under this final rule.
