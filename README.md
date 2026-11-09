# Easygenerator Auth Module

A production-ready sign-up / sign-in module: **NestJS + MongoDB** API with a
**React + TypeScript** front-end. Security was treated as a first-class
requirement — see [SECURITY.md](SECURITY.md) for the full threat model and
the controls mapped to each threat.

## Features

- Sign up with validated **email**, **name** (min 3 chars) and **password**
  (min 8 chars, ≥1 letter, ≥1 number, ≥1 special character) — live checklist
  in the UI, re-validated on the server.
- Sign in, protected `GET /api/auth/me`, welcome page, and logout.
- **Argon2id** password hashing; passwords are never logged or returned.
- Short-lived **access JWT (15 min, memory-only in the SPA)** + **rotating
  refresh tokens** in an `HttpOnly` cookie, stored hashed server-side with
  reuse (theft) detection.
- Brute-force defences: per-route **rate limiting**, **account lockout** after
  repeated failures, and **generic, timing-uniform** sign-in errors.
- Structured logging (pino) with credential redaction, one consistent error
  shape, Swagger docs in development, unit + e2e tests, GitHub Actions CI.

## Quick start (Docker — recommended)

```bash
docker compose up --build
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/health

## Local development (no Docker for the apps)

Prerequisites: Node.js 20+, MongoDB 7 (or just the database in Docker):

```bash
docker compose up -d mongo

# backend
cd backend
cp .env.example .env   # then set a real JWT_SECRET (32+ random chars)
npm install
npm run start:dev      # API on :3000, Swagger at /api/docs

# frontend (second terminal)
cd frontend
npm install
npm run dev            # web on :5173, /api proxied to :3000
```

Or from the repo root after `npm install`: `npm run dev` starts both.

## API

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/sign-up` | – | Create account, start session |
| POST | `/api/auth/sign-in` | – | Sign in, start session |
| POST | `/api/auth/refresh` | cookie | Rotate refresh token, new access token |
| POST | `/api/auth/logout` | cookie | Revoke the session |
| GET | `/api/auth/me` | Bearer JWT | **Protected** current-user profile |
| GET | `/api/health` | – | Liveness probe |

Sign-up / sign-in return `{ accessToken, user }` and set the refresh token as
an `HttpOnly; SameSite` cookie scoped to `/api/auth`. The raw refresh token
is never present in a JSON body.

## Configuration

All configuration is via environment variables, validated at boot (the app
refuses to start with an invalid config). See
[backend/.env.example](backend/.env.example). Never commit a real `.env`.

## Tests

```bash
cd backend
npm test            # unit tests (no database needed)
npm run test:e2e    # HTTP flow against a real MongoDB (docker compose up -d mongo)
npm run lint && npm run build
cd ../frontend && npm run lint && npm run build
```

A one-command verification of the whole repo:

```bash
./scripts/verify.sh   # builds + lints + unit tests; e2e when Mongo is up
```

## Project layout

```text
backend/   NestJS API (auth + users modules, Mongoose, JWT + refresh rotation)
frontend/  React + TypeScript SPA (Vite, react-router, react-hook-form + zod)
docker-compose.yml   MongoDB + API + web (nginx) for one-command startup
.github/workflows/   CI: lint, build, unit and e2e tests on every push/PR
SECURITY.md          Threat model, controls, and honest limitations
AI.md                How AI assistance was used (per the task brief)
```
