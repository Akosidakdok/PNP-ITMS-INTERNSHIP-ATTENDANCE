# PNP ITMS Internship Attendance System

## A centralized platform for managing internship operations

### Project overview

The PNP ITMS Internship Attendance System is a web application designed to centralize the day-to-day administration of internship programs. It brings attendance tracking, daily time records, intern documents, evaluations, project monitoring, calendar events, and staff workflows into one role-aware platform.

The system supports three user types—administrators, supervisors, and interns—each with a tailored experience and permission boundary. This replaces fragmented, manual processes with a single source of truth for internship records and operational activity.

**Project status:** Active development  
**My role:** Full-Stack Developer  
**Platform:** Responsive web application with PWA support  
**Primary users:** ITMS administrators, division supervisors, and interns

## The challenge

Internship administration involves several connected processes: recording attendance, calculating rendered hours, reviewing requirements, evaluating performance, coordinating projects, and communicating updates. When these activities are handled across separate tools or spreadsheets, it becomes difficult to maintain consistent records, enforce access rules, and give each stakeholder a clear view of their responsibilities.

The goal was to build an internal system that could:

- give interns a simple self-service workspace;
- give supervisors visibility into their assigned division;
- give administrators system-wide control and reporting;
- reduce manual attendance and DTR processing; and
- protect sensitive records through server-side authorization.

## The solution

I developed a role-based platform with separate administrative and intern experiences, backed by a REST API and a structured Supabase data layer.

### Core workflows

- **Attendance and DTR:** Interns scan a time-sensitive office QR code and complete live face verification. Staff can review, approve, reject, and manage attendance records. Approved scans feed the daily time record and reporting workflows.
- **Identity-assisted attendance:** The application supports face registration, liveness-oriented verification, one-time self-enrollment, enrollment history, and a controlled renewal-request workflow.
- **Intern management:** Administrators can manage intern records, supervisors, divisions, schools, account status, and password resets. Interns can update an allow-listed set of personal and emergency-contact details.
- **Document workflows:** Interns upload required documents, while authorized staff review files, leave remarks, update statuses, and preview files through protected access.
- **Performance evaluations:** Staff can record structured evaluation criteria and scores, while interns can view evaluations after they are released.
- **Project tracking:** Intern projects include progress, status, group members, GitHub and demo links, deliverables, archive/restore actions, and audit history.
- **Calendar and notifications:** Shared calendar events, announcements, reminders, and user notifications keep operational information visible to the appropriate audience.
- **Legal consent:** Versioned legal documents and acceptance records are presented during the appropriate authentication flow and retained with acceptance metadata.

## Technical approach

### Frontend

- React 18 with Vite
- React Router for protected, role-based navigation
- Responsive component-based UI for desktop and mobile use
- FullCalendar for event management
- QR scanning and QR generation workflows
- MediaPipe and Human.js-based vision utilities for face-related flows
- jsPDF and DOM/image utilities for printable and downloadable records
- PWA installation prompt and service-worker support

### Backend and data

- Node.js and Express REST API
- Supabase Postgres for relational application data
- Supabase Storage for private document and project-file storage
- JWT-based authentication with bcrypt password hashing
- Multer for controlled file handling
- Nodemailer for transactional email workflows
- SQL migrations for evolving the data model and security policies

### Security and authorization

Security was treated as a full-stack responsibility. Frontend route guards improve the user experience, but the backend remains the source of truth for authorization. Requests are scoped by authenticated account, role, assigned division, project membership, or resource ownership depending on the workflow.

The system also uses protected storage access, signed URLs for authorized previews, allow-listed profile updates, login attempt lockout handling, server-side project authorization, and database Row Level Security for sensitive tables.

## My overall role: Full-Stack Developer

I owned the project across the stack, from product workflow design and data modeling through implementation, testing, and deployment preparation.

My responsibilities included:

- translating internship-office workflows into user journeys and role permissions;
- designing and evolving the Supabase schema and SQL migrations;
- building the React pages, reusable components, responsive layouts, and protected routes;
- developing Express API endpoints, middleware, service modules, and validation logic;
- implementing attendance, DTR, document, evaluation, project, legal, notification, and face-verification workflows;
- integrating QR scanning, browser camera access, face-processing libraries, file storage, email, and calendar functionality;
- designing staff and intern experiences for different levels of access;
- writing automated backend tests for authorization, attendance timing, DTR records, face enrollment, and lockout behavior;
- reviewing workflows through acceptance matrices and defect inventories; and
- preparing the application for production deployment and continued security hardening.

In short, my role was not limited to frontend or backend implementation. I was responsible for connecting the user experience, business rules, APIs, database, security model, and operational workflows into one working product.

## Selected design decisions

### One attendance model across the system

Attendance, DTR views, and reports need to agree on the same business rules. The system was standardized around a two-scan daily model: one time-in and one time-out, with the lunch interval excluded from rendered hours. This keeps the calculation understandable for interns and consistent for staff review and reporting.

### Authorization at multiple layers

Because the system handles personal information, attendance history, uploaded documents, and biometric-related data, access is checked in the frontend and enforced again in the API and database policies. This prevents a hidden route or manually crafted request from bypassing role boundaries.

### Private file access by default

Documents and project files are stored privately. The backend returns authorized, short-lived access links instead of exposing storage paths directly, allowing staff to preview files without making the repository publicly accessible.

### Auditability for operational changes

Important staff actions—such as project archiving, restoration, and access-sensitive updates—are modeled so that the system can preserve who performed an action and when. This supports accountability as the platform becomes part of an actual administrative workflow.

## Outcome

The project established a single operational workspace for the internship program and created a foundation that can scale beyond attendance alone. Interns have a clearer self-service experience, supervisors can work within their division, and administrators can manage records and reporting from a centralized dashboard.

The work also produced a structured quality and security review process, including automated regression tests, acceptance criteria, workflow inventories, and a prioritized performance/security hardening plan. The application remains in active development, with continued attention on validation, pagination, reporting consistency, and real-device verification for camera-based workflows.

## What I learned

The most important lesson was that a business system is more than a collection of screens. A reliable experience depends on keeping the UI, API, database constraints, authorization rules, and business calculations aligned. Building this platform strengthened my ability to work across the entire product lifecycle and make decisions that balance usability, security, maintainability, and real operational needs.

## Portfolio summary

I built a full-stack internship management platform for PNP ITMS that centralizes attendance, DTR, document review, evaluations, project tracking, notifications, calendar events, legal consent, and identity-assisted verification. I owned the frontend, backend, database design, authorization model, integrations, automated testing, and deployment preparation.

