# Gingies Platform Backend v1

Node.js + Express + PostgreSQL backend for Gingies contractor platform.

## Quick start

1. Install dependencies:
   - `cd backend`
   - `npm install`
2. Configure env:
   - `cp .env.example .env`
3. Run migrations:
   - `npm run migrate`
4. Start API:
   - `npm run dev`

Server defaults to `http://localhost:4000`.

## Core routes

- Auth: `/api/auth/*`
- Jobs (homeowner + common actions): `/api/jobs/*`
- Contractor APIs: `/api/contractor/*`
- Admin APIs: `/api/admin/*`
- Health: `GET /api/health`

## Notes

- Notification delivery is polling-first in v1.
- Distance uses city centroid fallback when exact coordinates are absent.
- Assignment history is preserved in `job_assignments`.
