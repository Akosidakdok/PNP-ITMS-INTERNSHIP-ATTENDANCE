# Week 6 Audit Environment Checklist

**Prepared:** August 25, 2026  
**Rule:** Use development or dedicated acceptance data only. Never use real biometric samples or production credentials in repository artifacts.

## Local Application Readiness

- [x] Backend dependencies are installed.
- [x] Frontend dependencies are installed.
- [x] Backend `.env` file exists.
- [x] Frontend environment file exists.
- [x] Backend automated tests pass: 19/19.
- [x] Frontend production build succeeds.
- [x] Backend root endpoint responds locally.
- [x] Missing login fields return HTTP 400.
- [x] Protected administrator endpoint returns HTTP 401 without authentication.
- [ ] Supabase health check passes. **Blocked:** `/ping` currently returns HTTP 503.
- [ ] Interactive browser connection is available. **Blocked:** no browser surface is connected.
- [ ] Frontend and backend can be exercised together through an authenticated session.

## Required Test Accounts

- [ ] Active administrator account
- [ ] Active supervisor assigned to Division A
- [ ] Active supervisor assigned to Division B
- [ ] Inactive supervisor
- [ ] Active intern in Division A with Face ID enrolled
- [ ] Active intern in Division A without Face ID enrolled
- [ ] Active intern in Division B
- [ ] Inactive or archived intern
- [ ] Intern eligible for one-time self Face ID enrollment
- [ ] Intern with an approved Face ID renewal request

Test accounts must use a clear acceptance prefix such as `W6-AUDIT-` and must not reuse operational users.

## Required Attendance and DTR Data

- [ ] Day with no scans
- [ ] Day with Time In only
- [ ] Day with Time In and Time Out
- [ ] Approved attendance day
- [ ] Pending attendance day
- [ ] Rejected attendance day
- [ ] Duplicate scan attempt within 10 seconds
- [ ] Attempt after the daily scan limit
- [ ] Suspended-day override
- [ ] Excused-day override
- [ ] Custom-hours override at 0, 8, and 24 hours
- [ ] Cleared override
- [ ] Month boundary and Manila-time-zone boundary records

## Required Document Data

- [ ] Pending, accepted, and revision-requested documents
- [ ] Duplicate document types
- [ ] PDF and supported image files
- [ ] Unsupported executable or script file
- [ ] Empty file
- [ ] File at the maximum permitted size
- [ ] File larger than the maximum permitted size
- [ ] Filename containing commas, apostrophes, en dashes, and Filipino characters
- [ ] More records than one document-review page

## Required Evaluation and Project Data

- [ ] Released and unreleased evaluations
- [ ] Scores at 0, 74, 75, 80, 100, below 0, and above 100
- [ ] More than 100 interns and more than 100 evaluations for scale tests
- [ ] Project leader, member, contributor, and unrelated intern
- [ ] Project inside and outside a supervisor's division
- [ ] Active, archived, and restored projects
- [ ] Project deliverable uploaded by different authorized roles

## Required Report and Notification Data

- [ ] Names and schools containing commas and quotation marks
- [ ] Names containing `Ñ`, accented characters, and en/em dashes
- [ ] Report period with no results
- [ ] Report period with pending, approved, and rejected attendance
- [ ] Notification addressed to an intern
- [ ] Separate notifications addressed to two different interns
- [ ] Read and unread notifications

## Device Matrix

| Platform | Browser | Portrait | Landscape | Permission Denied/Regranted | Background/Resume | Status |
|---|---|---:|---:|---:|---:|---|
| Windows desktop | Current Chrome or Edge | N/A | N/A | Required | Required | Blocked: browser unavailable |
| Android phone | Current Chrome | Required | Required | Required | Required | Not run |
| iPhone | Current Safari | Required | Required | Required | Required | Not run |

## Camera and Network Conditions

- [ ] HTTPS or secure local context is enabled for camera APIs.
- [ ] Front and rear cameras can be enumerated where supported.
- [ ] Camera permission denial produces a recoverable message.
- [ ] Slow 3G/4G throttling test is available.
- [ ] Offline and request-timeout behavior can be simulated.
- [ ] Face model assets load successfully after a cold cache.
- [ ] Face model assets remain usable after background/resume.

## Exit Requirement

Authenticated and mobile cases may only be marked `Pass` after the Supabase health check, test accounts, browser connection, and physical-device requirements above are satisfied. Static source inspection is not a substitute for those execution results.

