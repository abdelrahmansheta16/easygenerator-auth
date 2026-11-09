# How AI assistance was used

AI (Muse Code, model `muse-wonder-full-1.0`) was used as a pair-programming
force multiplier throughout this task. I owned the requirements, the security
design, and the verification; the AI generated scaffolding and first drafts
which I reviewed, corrected, and tested before keeping.

## What was AI-assisted

- **Scaffolding & boilerplate**: NestJS/Vite project generation, module
  wiring (`AuthModule`, `UsersModule`), DTOs with the exact validation rules
  from the brief, routing, forms (`react-hook-form` + `zod`), Dockerfiles,
  `docker-compose.yml`, GitHub Actions CI, and the first drafts of this file
  and the README structure.
- **Security implementation drafts**: Argon2id hashing, JWT strategy/guard,
  rotating refresh tokens with family reuse-detection, throttling, account
  lockout, generic sign-in errors with dummy-hash timing equalization, pino
  redaction, Helmet/CORS/CSRF-header handling, and the global error filter.
- **Tests**: first drafts of the `AuthService` unit tests and the supertest
  e2e flow (including the refresh-rotation and NoSQL-injection cases).

## Prompts / approaches that worked well

- Giving the AI the **actual PDF brief text plus an explicit constraint**
  ("take into consideration all of the security aspects") and asking it to
  enumerate the requirements as a checklist before writing code. That kept
  the easy-to-miss clauses (protected endpoint, `AI.md`, bonus items) in scope.
- Asking for **small, reviewable files** (one concern each) instead of one
  large generated file — much easier to audit for security mistakes.
- **Verify-by-execution at every step**: build → unit tests → e2e against a
  real MongoDB → live `curl` flow. AI output was only kept once it passed.

## What I had to correct or rework

- **Dependency versions**: npm initially resolved `@nestjs/*` v12 (ESM-only)
  packages next to Nest 11 core and `@nestjs/swagger@12`, which broke Jest
  (CommonJS) and peer ranges. I pinned the Nest-11-compatible majors
  (`@nestjs/config@^4`, `mongoose/jwt/passport@^11`, `swagger@^11`).
- **Type errors the AI's first draft missed**: `JwtModule` `expiresIn`
  typing and a Joi `validationOptions` type mismatch — fixed with proper
  `JwtModuleOptions` typing rather than `any`.
- **Test mocks used an invalid ObjectId** (`'user-1'`), which the real
  `new Types.ObjectId(...)` call correctly rejected; mocks were fixed to a
  real ObjectId hex string instead of weakening the production code.
- **Mongoose 9 / MongoDB driver 7 breaks under Jest 30**: e2e connections
  failed with `Missing required sub-document 'driver'` because the new
  driver's BSON `Map` client-metadata doesn't survive Jest's VM realm,
  while the same code connected fine under plain Node. I diagnosed it with
  progressively smaller probes (plain Node → Jest → driver internals) and
  pinned **Mongoose 8 (driver 6)**, the battle-tested pairing for
  Nest 11 + Jest; I also switched `user.id` to typed `user._id.toString()`.
- **A quoting bug in my own smoke script** (nested `\"` inside `"$(...)"`)
  first made live sign-in look broken; the app was fine — the test harness
  was fixed, not the code, after the server's JSON-parse error proved it.
- **Judgement calls I made explicitly** (and documented in SECURITY.md):
  access token in memory + refresh cookie instead of `localStorage`; sign-up
  returns `409` for duplicates while sign-in stays fully generic (rate
  limiting covers the residual enumeration risk); auto-login after sign-up;
  HS256 for a single service with RS256/JWKS noted as the multi-service path.

## My verification

Everything shipped here was executed: backend build, frontend build, ESLint,
5 unit tests, the e2e suite against Dockerized MongoDB, and a live end-to-end
HTTP flow (sign-up → protected route → refresh rotation → old-token rejection →
logout). `scripts/verify.sh` reproduces the checks.
