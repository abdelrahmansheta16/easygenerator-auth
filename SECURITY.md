# Security

This module handles credentials and sessions, so it was built
secure-by-default. Each control below exists in the code (not just on paper);
file references point at where it is enforced.

## Controls

### Passwords & credential storage
- **Argon2id** hashing (`argon2` package) with per-password salts —
  `backend/src/auth/auth.service.ts`. Plaintext passwords are never stored,
  logged, or returned; the hash field is `select: false` in Mongoose and
  responses use an explicit `PublicUser` shape.
- Policy enforced server-side (class-validator DTOs): ≥8 chars, ≥1 letter,
  ≥1 number, ≥1 special char; name ≥3 chars; valid email. Emails are
  normalized (trim + lowercase) so `Ada@X.com` and `ada@x.com` are one account.

### Sessions & tokens
- **Access JWT**: HS256, 15-minute expiry, `iss`/`aud` validated, sent as
  `Authorization: Bearer`. The SPA keeps it **in memory only** — never
  `localStorage`, where XSS could steal it (`frontend/src/lib/api.ts`).
- **Refresh tokens**: 48 random bytes, sent as an `HttpOnly`, `SameSite`,
  `Secure` (in production) cookie scoped to `/api/auth`. Only their
  **SHA-256 hash** is stored, with a TTL index. Every refresh **rotates**
  the token; presenting an already-rotated token is treated as theft and
  **revokes the whole token family**.
- Logout revokes the refresh token server-side (not just client state).

### Brute force & enumeration
- `@nestjs/throttler`: global limit + stricter limit on `/auth/*`
  (10 requests/minute per IP by default).
- **Account lockout**: 5 consecutive failed sign-ins lock the account for
  15 minutes (configurable).
- Sign-in returns one generic `Invalid email or password.` for unknown
  email, wrong password, and locked accounts. For unknown emails the code
  still verifies against a dummy Argon2id hash so **response timing cannot
  enumerate accounts**.

### Injection & input handling
- Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` +
  `transform`: unknown fields are rejected (no mass assignment) and JSON
  operator objects such as `{"email":{"$gt":""}}` fail DTO validation
  before any query is built. Covered by an e2e test.
- Mongoose typed queries; unique index on email; duplicate-signup race
  handled via the index error.

### Transport, headers & CORS
- **Helmet** on the API (CSP, HSTS, `no-sniff`, frameguard…); nginx sets a
  strict CSP and `X-Frame-Options: DENY` for the SPA.
- **CORS** is an exact-origin allowlist with credentials — never `*`.
- **CSRF**: access-token calls use a header (not a cookie). The two
  cookie-authenticated endpoints (`/refresh`, `/logout`) require the custom
  `x-requested-with: XMLHttpRequest` header plus `SameSite` cookies: a
  cross-site form cannot set custom headers, and a cross-origin fetch that
  sets one triggers a CORS preflight.

### Errors, logging & config
- One error shape for the API; unknown errors become a generic 500 —
  stacks and database messages never reach the client
  (`backend/src/common/http-exception.filter.ts`).
- **pino** structured logs with request IDs; `Authorization`, cookies and
  request-body passwords are redacted. Security events (sign-up, sign-in,
  failures, lockouts, refresh-reuse) are logged with user IDs only.
- Configuration is validated with Joi at boot (fail fast). Secrets come
  from the environment; `.env.example` contains no real secret and `.env`
  is git-ignored. Swagger is disabled in production by default.
- Docker images are multi-stage and the API runs as the non-root `node` user.

## Honest limitations / next steps for a real production rollout

- **HTTPS** must be terminated in front of the stack (the compose file is
  local HTTP; cookies become `Secure` automatically when `NODE_ENV=production`).
- HS256 is appropriate for a single service that both signs and verifies.
  With multiple verifiers, switch to **RS256/ES256 with key rotation (JWKS)**.
- Add **email verification** and password reset (hashed, expiring, single-use
  tokens), breached-password checks (HIBP k-anonymity), and optional MFA/TOTP.
- Move throttler/lockout state sharing and secrets to managed services
  (Redis, a secret manager) when running multiple API replicas.
- Add audit-log persistence and alerting on `auth.refresh_reuse_detected`.
