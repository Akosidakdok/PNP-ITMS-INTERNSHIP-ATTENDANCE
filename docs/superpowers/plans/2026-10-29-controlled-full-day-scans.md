# Controlled scans throughout the day

**Goal:** User-confirmed rule: controlled time-ins use one persisted time between 07:45:00 and 08:00:00 Philippine time, including early, lunch and afternoon scans. Controlled time-outs use exactly 17:00:00 Philippine time.

**Design:** Extend the existing representation trigger, retaining `original_scan_time`, raw scan ordering, official DTR times, approval state and daily mirrors. Honor enabled scan switches and saved policy effectivity. Keep existing randomized morning choices stable. Append an immutable audit event for each new representation change; preserve real timestamps and camera watermarks. Manual entries without real scans and uncontrolled accounts remain unchanged. Apply the same rules to eligible existing controlled rows, using their saved approved policy.

**Approach:** Add an additive, rerunnable migration replacing the existing adjustment/audit functions and updating eligible stored representations. Keep the single combined deployment bundle in sync and broaden the preview/history labels from morning-only to controlled scan adjustments.

- [x] Add failing PostgreSQL cases for afternoon and early time-ins, exact 17:00 time-outs, exclusions, immutable originals, rollback, unchanged DTR/mirrors and reruns.
- [x] Implement the migration and combined deployment update; update UI explanations/history labels.
- [x] Run backend/frontend suites and production build; independent review found no important issues.
- [x] Apply the migration to the user's project and verify the two reported entries through read-only queries.

Applied in the connected project's Supabase SQL Editor successfully. Verified logs 773/774 store 07:56:55 and 17:00:00 PHT, while original QR instants remain 14:46:58.529 and 14:48:08.792 PHT. Both new audit events preserve the original timestamps and identify the rule used. Official 08:00/17:00 DTR values, approval state and the daily mirror remain unchanged. The migration is rerunnable; existing randomized choices remain stable.
