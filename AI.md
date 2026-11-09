# How AI assistance was used

AI (Muse Code, model `muse-wonder-full-1.0`) was used throughout this task
as a drafting and scaffolding accelerator — never as an authority. The
operating rule was simple: **AI proposes, the engineer disposes.** Nothing
AI-generated was kept until it had been read line-by-line, built, linted,
and executed against a real check. This file documents that workflow
honestly: what AI drafted, what I decided myself, what I corrected, and
what evidence backs the result.

## Operating principles

These are the practices I applied. Each one is illustrated with what
actually happened in this repository, not with generic advice.

### 1. Start from the primary source, not a paraphrase

I gave the AI the actual PDF brief text, plus one explicit constraint
(“take into consideration all of the security aspects”), and required it
to enumerate every requirement as a checklist **before** writing code.
That checklist is what kept the easy-to-miss clauses in scope: the
protected endpoint, the mandatory `AI.md`, and the bonus items (logging,
error handling, tests, CI, API docs). A paraphrased prompt would have
silently dropped half of them. The brief, not the model's summary of it,
stayed the contract for the whole task.

### 2. Threat-model before generating code

For an auth module, the design decisions matter more than the typing.
So the controls were fixed first — Argon2id hashing, short-lived access
JWTs, rotating refresh-token families with reuse detection, generic
anti-enumeration errors, rate limiting + lockout — and only then was AI
asked to implement them file by file. The result is documented in
[SECURITY.md](SECURITY.md), including the limitations I chose not to hide
(HS256 vs RS256, the sign-up `409` trade-off). AI is good at producing
plausible-looking auth code; deciding *which* auth code is the engineer's job.

### 3. Small, reviewable increments — read everything

I asked for one concern per file and reviewed each file before the next
was generated: DTOs (`backend/src/auth/dto/`), schemas, JWT strategy,
guard, service, controller, exception filter. Small files make security
review real instead of ceremonial: for example, the
`select: false` on `passwordHash` in
`backend/src/users/schemas/user.schema.ts` and the explicit `PublicUser`
response shape are the kind of detail you only catch by actually reading.
If a generated file could not be reviewed in one sitting, it was too big.

### 4. Gates, not trust: verify by execution at every layer

AI output was only kept after passing, in order: TypeScript build →
ESLint → unit tests → e2e against a real MongoDB → live HTTP flow
through the running servers → CI on a fresh checkout. Each layer catches
what the previous one cannot. Two rules kept this honest:

- **A check must be able to fail.** The e2e suite
  (`backend/test/auth.e2e-spec.ts`) asserts real status codes and
  security properties — HttpOnly cookie present, no refresh token in the
  JSON body, no `passwordHash` in `/api/auth/me`, old refresh token
  rejected after rotation, `{"email":{"$gt":""}}` rejected with 400.
- **Self-authored “PASS” labels prove nothing.** The live smoke script
  asserted exact HTTP codes per step; when it failed (see Corrections),
  the server's own JSON-parse error was the oracle that told us the
  *script*, not the app, was wrong.

### 5. Debug to root cause with shrinking probes — never weaken a test

When something failed, the workflow was: reproduce → shrink the failing
case → find the cause → fix the cause. Two examples:

- Test mocks initially used `id: 'user-1'`, which the real
  `new Types.ObjectId(...)` correctly rejected. The fix was valid mock
  data, not a looser production code path.
- E2E connections failed under Jest with
  `Missing required sub-document 'driver'` while the identical code
  connected under plain Node. Successively smaller probes (plain Node
  handshake → Jest-only Mongoose connect → driver metadata internals)
  isolated it to Mongoose 9 / MongoDB driver 7 building BSON `Map`
  client-metadata that does not survive Jest 30's module realm. The fix
  was pinning **Mongoose 8 (driver 6)** — see Corrections.

Deleting, skipping, or loosening a failing test to get green was never
an option. A red test is information.

### 6. Dependency and type discipline

AI-generated `npm install` output was treated as a proposal, not a
result. npm first resolved ESM-only `@nestjs/*` v12 packages next to a
Nest 11 core, which broke Jest and peer ranges; I pinned the
Nest-11-compatible majors instead of reaching for `--force`. The same
discipline applied to types: when the first draft produced a
`JwtModule` `expiresIn` type error and a Joi options mismatch, they were
fixed with proper `JwtModuleOptions` typing — no `any`, no
`eslint-disable`. After the Mongoose 8 pin, ESLint flagged
`user.id` as `any`; the code now uses typed `user._id.toString()`
throughout `backend/src/auth/auth.service.ts`. Final state: ESLint
clean on the backend, zero errors on the frontend.

### 7. Secrets and security hygiene around the AI itself

- AI never received real credentials. The local `.env` was generated on
  this machine; only `backend/.env.example` (placeholder secret) is in git.
- Before the first commit I verified with `git check-ignore` that
  `.env`, `node_modules`, and `dist` could not be staged, and confirmed
  no secret was in the staged set.
- Generated logging code was reviewed specifically for credential
  leakage: pino redacts `Authorization`, cookies, `set-cookie`, and
  request-body passwords (`backend/src/app.module.ts`).

### 8. Leave durable collateral, not chat history

Everything needed to re-verify this work lives in the repository, not in
an AI conversation: unit tests (`backend/src/auth/auth.service.spec.ts`),
the e2e suite, `scripts/verify.sh` (one-command lint + build + test),
and `.github/workflows/ci.yml`, which re-runs the full gate — including
e2e against a `mongo:7` service — on every push. If the AI session
disappeared tomorrow, the repo would still prove itself.

### 9. Report blockers and unverified paths plainly

Two environment problems occurred, and both are recorded here instead of
being smoothed over:

- **Docker daemon unresponsive locally.** `docker info` hung against a
  Docker Desktop backend that accepted connections but never replied.
  Rather than force-restarting the user's Docker or claiming success,
  local e2e and live verification ran against a real `mongod` 7.0.14
  binary, and CI independently ran the e2e suite against a `mongo:7`
  service. Consequence, stated honestly: the `docker compose up` stack
  shipped in `docker-compose.yml` itself was **not** executed on this
  machine; it should be run once Docker Desktop is restarted.
- **Disk at 100%.** The build failed with `ENOSPC` mid-task. Only the
  regenerable npm cache (~7 GB) was cleared; no project or personal
  files were touched.

A claim of “done” that hides an unverified path is worse than an
unverified path. Reviewers can compensate for the latter.

## Division of labour

**AI drafted (then I reviewed and tested):**

- Scaffolding and boilerplate: NestJS/Vite generation, module wiring
  (`AuthModule`, `UsersModule`), DTOs carrying the exact validation
  rules from the brief, routing, forms (`react-hook-form` + `zod`),
  Dockerfiles, `docker-compose.yml`, and the CI workflow.
- First drafts of the security implementation: Argon2id hashing, JWT
  strategy/guard, rotating refresh tokens with family reuse detection,
  throttling, account lockout, generic sign-in errors with dummy-hash
  timing equalization, log redaction, Helmet/CORS/CSRF-header handling,
  and the global exception filter.
- First drafts of the tests (`AuthService` unit tests, supertest e2e),
  the README structure, and this file.

**I owned:**

- Requirements extraction from the brief and the definition of done.
- The security design and every trade-off in [SECURITY.md](SECURITY.md):
  access token in memory + HttpOnly refresh cookie instead of
  `localStorage`; sign-up returns `409` for duplicates while sign-in
  stays fully generic (rate limiting covers the residual enumeration
  risk); auto-login after sign-up; HS256 for a single signing/verifying
  service, with RS256/JWKS documented as the multi-service path.
- Every dependency pin, type fix, and debugging decision below.
- The verification strategy and the decision of when the work was done.

## Corrections log

Everything the AI (or I) got wrong, and what replaced it:

1. **Dependency resolution.** npm resolved `@nestjs/*` v12 (ESM-only)
   packages and `@nestjs/swagger@12` next to Nest 11 core, breaking
   Jest (CommonJS) and peer ranges. Pinned Nest-11-compatible majors:
   `@nestjs/config@^4`, `@nestjs/mongoose|jwt|passport@^11`,
   `@nestjs/swagger@^11`.
2. **Type errors in the first draft.** `JwtModule` `expiresIn` typing
   and a Joi `validationOptions` mismatch — fixed with proper
   `JwtModuleOptions` typing, not `any`.
3. **Invalid test data.** Mocks used `id: 'user-1'`; production code
   correctly rejected it as a non-ObjectId. Mocks were fixed to real
   ObjectIds; production code was not weakened.
4. **Mongoose 9 / driver 7 vs Jest 30.** Diagnosed as described in
   principle 5; pinned **Mongoose 8 (driver 6)**, the battle-tested
   pairing for Nest 11 + Jest, and switched `user.id` to typed
   `user._id.toString()`. The same Jest probe that had timed out at 8s
   then connected in 18ms.
5. **Stale scaffold test.** The CLI-generated `test/app.e2e-spec.ts`
   tested a removed “Hello World” controller; deleted rather than left
   to rot. E2E hook timeout raised to 30s for real app + DB startup,
   and the pino-pretty worker transport made dev-only so test processes
   exit cleanly.
6. **My own smoke-script bug.** Nested `\"` inside `"$(...)"` corrupted
   the JSON payloads, briefly making live sign-in look broken (400).
   The server's JSON-parse error proved the harness was at fault; the
   script's quoting was fixed and all 16 live checks then passed. The
   application code was never changed to accommodate a broken test.

## Verification evidence

All of the following were executed in this session, not assumed:

- Backend: `npm run build` clean, ESLint clean, **5/5 unit tests**,
  **4/4 e2e tests** against MongoDB 7.0.14.
- Frontend: ESLint zero errors, production build clean.
- Live flow against the running servers (via the Vite `/api` proxy):
  **16/16 checks** — weak password 400, sign-up 201 with HttpOnly
  cookie and no refresh token in the body, protected route 401/200,
  refresh rotation 200, reused-token 401, missing-CSRF-header 403,
  wrong-password generic 401, correct sign-in 200, NoSQL-operator
  payload 400, logout 204, refresh-after-logout 401.
- `scripts/verify.sh` full gate: exit 0.
- GitHub Actions CI on the pushed commit: backend and frontend jobs
  both green, including e2e against a `mongo:7` service container.
- One path remains explicitly unverified: `docker compose up --build`
  on this machine (see principle 9).

## What I would not delegate to AI

- The threat model and any decision where “plausible” and “correct”
  diverge: token lifetimes, error-message genericness, what gets logged.
- Declaring work verified. AI can run checks; interpreting whether the
  checks actually prove the requirement is an engineering judgement.
- Anything involving real secrets, production data, or irreversible
  actions (history rewrites, force-pushes, deploys) without an explicit
  human decision per action.

Used this way, AI genuinely was a force multiplier: it removed hours of
scaffolding and first-draft typing. It did not remove — and was never
asked to remove — the engineering judgement on top of it.
