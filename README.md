# PNP ITMS Internship Attendance System

A web application for managing internship attendance and related workflows within PNP ITMS.

## Overview

The system provides role-based access for administrators, supervisors, and interns. Its main capabilities include attendance monitoring, intern records, document workflows, evaluations, calendar events, project tracking, and identity-assisted attendance verification.

## Technology

- React and Vite frontend
- Node.js and Express backend
- Supabase database and storage

## Local development

Install the dependencies in both application directories:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Create the required local environment files using credentials supplied by the project administrator. Environment files and production credentials must never be committed to source control.

Run the backend and frontend in separate terminals:

```bash
# Backend
cd backend
npm run dev
```

```bash
# Frontend
cd frontend
npm run dev
```

## Testing

```bash
cd backend
npm test
```

## Persistent PWA sessions

Apply `backend/supabase/migrations/20261015061204_account_sessions.sql` to the Supabase database before deploying the backend session changes. Deploy the backend before the frontend. New sign-ins receive a 30-day device session and short-lived access tokens. Existing sign-ins need one more login to receive a refresh token.

## Security

- Do not commit environment files, credentials, tokens, biometric data, or production records.
- Keep privileged database credentials on the backend only.
- Use HTTPS for every production deployment.
- Obtain deployment and database setup instructions through the authorized internal project documentation.

## Access

This project is intended for authorized development and operational use only.
