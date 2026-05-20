# Logging, Request Tracing & Observability

This is the single reference for every engineer writing log calls in `flowbrand-api`.
Read this before touching any service that emits logs.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [File map](#2-file-map)
3. [How the pieces connect](#3-how-the-pieces-connect)
4. [Injecting the logger](#4-injecting-the-logger)
5. [Log methods](#5-log-methods)
6. [What every log line contains](#6-what-every-log-line-contains)
7. [PII — masking helpers](#7-pii--masking-helpers)
8. [Request tracing — how requestId works](#8-request-tracing--how-requestid-works)
9. [Job context — queue processors](#9-job-context--queue-processors)
10. [Enriching context mid-request](#10-enriching-context-mid-request)
11. [Log levels and environment config](#11-log-levels-and-environment-config)
12. [Event name catalog](#12-event-name-catalog)
13. [Rules enforced at code review](#13-rules-enforced-at-code-review)
14. [Acceptance criteria](#14-acceptance-criteria)

---

## 1. Quick start

```typescript
import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../common/logger/pino-logger.service';
import { maskId, maskEmail } from '../common/logger/pii';

@Injectable()
export class AuthService {
  constructor(private readonly logger: PinoLoggerService) {}

  async login(userId: string) {
    // info — standard event
    this.logger.info('auth.login.success', { userId: maskId(userId) });

    // warn — recoverable problem
    this.logger.warn('auth.login.failed', { userId: maskId(userId) });

    // error — pass the Error object as the third argument
    this.logger.error('auth.session.not_found', { userId: maskId(userId) }, err);
  }
}
```

Three rules to remember:

- You never pass `requestId` — it is injected automatically from `AsyncLocalStorage`
- You never call `console.log` — it bypasses Pino entirely
- You never pass a raw `Error` object inside `data` — pass it as the third argument to `error()`

---

## 2. File map

```
src/common/
├── logger/
│   ├── pino.logger.ts              Configured Pino instance (base fields, redact, level, transport)
│   ├── logger-context.service.ts   AsyncLocalStorage wrapper
│   ├── pino-logger.service.ts      The service you inject — info / warn / error / debug
│   ├── pii.ts                      maskId(), maskEmail(), maskSessionId()
│   └── logger.module.ts            @Global() module — no import needed in your own module
└── interceptors/
    └── logging.interceptor.ts      HTTP request/response logging + requestId lifecycle
```

---

## 3. How the pieces connect

```
Incoming HTTP request
        │
        ▼
LoggingInterceptor
  - reads X-Request-ID header (or generates a UUID v4 if absent/invalid)
  - echoes requestId in X-Request-ID response header
  - opens an AsyncLocalStorage context: { requestId }
  - logs http.request.received
  - logs http.request.completed / http.request.rejected / http.request.error on exit
        │
        ▼
AsyncLocalStorage (per-request store)
  { requestId, userId?, sessionId?, jobId?, queue?, attempt? }
        │
        ▼
PinoLoggerService  (called anywhere in the async chain)
  - reads the ALS store on every call
  - masks userId → usr_****xxxx, sessionId → sess_****xxxx
  - masks email fields in data
  - unpacks Error objects into { error: string, stack: string }
  - writes structured JSON to Pino
        │
        ▼
Pino → stdout
  - adds service, env, timestamp, level automatically
  - redacts sensitive field names as [REDACTED] (safety net)
  - pino-pretty in development, raw JSON everywhere else
```

---

## 4. Injecting the logger

`LoggerModule` is `@Global()` — you never import it in your own module. Just add
`PinoLoggerService` to your constructor.

```typescript
import { PinoLoggerService } from '../common/logger/pino-logger.service';

@Injectable()
export class FunnelGenerationProcessor {
  constructor(private readonly logger: PinoLoggerService) {}
}
```

If you also need to enrich the ALS context (set userId after auth, or start a job
context), inject `LoggerContextService` alongside it:

```typescript
import { PinoLoggerService } from '../common/logger/pino-logger.service';
import { LoggerContextService } from '../common/logger/logger-context.service';

@Injectable()
export class AuthGuard {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly context: LoggerContextService,
  ) {}
}
```

---

## 5. Log methods

### `logger.info(event, data?)`

Standard operational events — things that happened and are expected.

```typescript
this.logger.info('auth.login.success', { userId: maskId(user.id) });
this.logger.info('funnel.write.committed', { jobId, funnelId });
this.logger.info('email.queued', { to: maskEmail(recipient), type: 'onboarding' });
```

### `logger.warn(event, data?)`

Unexpected but recoverable situations — retryable failures, business rule violations.

```typescript
this.logger.warn('auth.login.failed', { userId: maskId(user.id) });
this.logger.warn('funnel.llm.gemini.failed', { jobId, durationMs, error: err.message });
this.logger.warn('auth.otp.rate_limited', { userId: maskId(user.id), retryAfterMs: 60000 });
```

### `logger.error(event, data?, err?)`

Failures that require attention. Always pass the caught `Error` as the **third argument**
— `PinoLoggerService` unpacks `.message` and `.stack` automatically so they serialize
correctly in JSON. Never put a raw `Error` object inside `data`.

```typescript
// Correct — err is unpacked into { error: string, stack: string }
this.logger.error('funnel.write.rolled_back', { jobId, funnelId }, err);

// Also fine — if you only have the message string
this.logger.error('funnel.status.failed', { jobId, error: err.message });

// Wrong — Error objects serialize as {} in JSON
this.logger.error('funnel.job.failed', { error: err });
```

Stack traces are included in non-production environments. Pino's `redact` config
strips `stack` in production automatically — you do not need to handle this yourself.

### `logger.debug(event, data?)`

Verbose diagnostic detail. Only emitted when `LOG_LEVEL=debug`. Never use in production.

```typescript
this.logger.debug('llm.gemini.request', { promptSummary: ctx.businessType });
```

---

## 6. What every log line contains

Every line is valid JSON. Fields are merged in this order:
`event` → ALS context fields (auto) → your `data` object.

### Always present (added automatically)

| Field | Source | Example |
|-------|--------|---------|
| `event` | Your call | `"auth.login.success"` |
| `level` | Pino | `"info"` |
| `timestamp` | Pino | `"2026-05-19T09:14:22.001Z"` |
| `service` | Pino base config | `"flowbrand-api"` |
| `env` | Pino base config | `"production"` |

### From AsyncLocalStorage (when set)

| Field | Set by | Masked? |
|-------|--------|---------|
| `requestId` | `LoggingInterceptor` | No — it is a UUID, not PII |
| `userId` | `contextService.setUserId()` | Yes → `usr_****xxxx` |
| `sessionId` | `contextService.setSessionId()` | Yes → `sess_****xxxx` |
| `jobId` | Processor `run()` call | No |
| `queue` | Processor `run()` call | No |
| `attempt` | Processor `run()` call | No |

### Common fields you supply in `data`

| Field | When | Notes |
|-------|------|-------|
| `durationMs` | HTTP responses, LLM calls | `Date.now() - start` |
| `statusCode` | HTTP responses | Integer |
| `error` | Error and warn events | String — `err.message` |
| `provider` | LLM success events | `'gemini'` or `'groq'` |
| `willRetry` | Job failed events | Boolean |
| `funnelId` | Funnel events | String |
| `jobId` | Job events | String or number |

### Example output

```json
{
  "event": "funnel.llm.success",
  "level": "info",
  "timestamp": "2026-05-19T09:14:23.410Z",
  "service": "flowbrand-api",
  "env": "production",
  "requestId": null,
  "jobId": "1042",
  "queue": "funnel-generation",
  "attempt": 1,
  "provider": "gemini",
  "durationMs": 3820,
  "funnelId": "funnel_abc123"
}
```

---

## 7. PII — masking helpers

Import from `src/common/logger/pii.ts`. Call these **at the log call site** — before
passing values to the logger.

### `maskId(id, prefix?)`

```typescript
import { maskId } from '../common/logger/pii';

maskId('usr_abc123def456')   // → 'usr_****f456'  (detects prefix automatically)
maskId('abc123def456')       // → 'usr_****f456'  (applies default 'usr' prefix)
maskId('abc123def456', 'svc') // → 'svc_****f456'
maskId('')                   // → 'usr_****'      (safe fallback)
```

### `maskSessionId(sessionId)`

Thin wrapper around `maskId` with `'sess'` prefix.

```typescript
import { maskSessionId } from '../common/logger/pii';

maskSessionId('sess_xyz987abc123')  // → 'sess_****c123'
maskSessionId('xyz987abc123')       // → 'sess_****c123'
```

### `maskEmail(email)`

```typescript
import { maskEmail } from '../common/logger/pii';

maskEmail('alice@example.com')   // → 'a****@example.com'
maskEmail('a@example.com')       // → 'a****@example.com'
maskEmail('')                    // → 'unknown'
maskEmail('notanemail')          // → 'invalid'
```

### In practice

```typescript
// Always mask before logging
this.logger.info('auth.login.success', {
  userId:    maskId(user.id),
  sessionId: maskSessionId(session.id),
});

this.logger.info('waitlist.joined', {
  email: maskEmail(entry.email),
});

// email fields inside data are also masked automatically by PinoLoggerService
// as a last line of defence — but call maskEmail() yourself regardless
```

### Fields that must never be logged — not even masked

- Passwords and password hashes
- OTP codes
- JWT tokens — `accessToken`, `refreshToken`
- API keys — `GEMINI_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`
- Raw Redis keys containing secrets

Pino's `redact` config censors these as `[REDACTED]` if they slip through, but the
rule is to never pass them in the first place. If you add a new sensitive field to
the application, add it to `redact.paths` in `pino.logger.ts` in the same PR.

---

## 8. Request tracing — how requestId works

Every log line emitted during an HTTP request carries the same `requestId`. You never
pass it manually.

**Lifecycle:**

1. `LoggingInterceptor` reads the `X-Request-ID` header from the incoming request
2. If the header is absent or not a valid UUID v4, a new UUID is generated server-side
3. The `requestId` is stored in `AsyncLocalStorage` and echoed back in the
   `X-Request-ID` response header
4. Every `logger.info/warn/error/debug()` call downstream reads `requestId` from ALS
   automatically — no parameter passing needed

**Searching logs for a single request:**

```bash
# All lines from http.request.received to http.request.completed
grep "a3f1b2c3-d4e5-6789-abcd-ef0123456789" app.log | jq .

# Count log lines for that request
grep "a3f1b2c3-d4e5-6789-abcd-ef0123456789" app.log | wc -l
```

**Passing a requestId from a client (e.g. frontend or integration tests):**

```bash
curl -X POST https://api.example.com/funnels/generate \
  -H "X-Request-ID: a3f1b2c3-d4e5-6789-abcd-ef0123456789" \
  -H "Content-Type: application/json" \
  -d '{}'
```

The same UUID will appear in the response header and in every log line for that request.

---

## 9. Job context — queue processors

Bull queue callbacks run outside the HTTP request's async context — `requestId` is
`null` in processors. You must start a fresh ALS context at the top of your processor
and use `jobId` as the trace identifier instead.

```typescript
import { LoggerContextService } from '../common/logger/logger-context.service';
import { PinoLoggerService } from '../common/logger/pino-logger.service';

@Processor(QUEUES.FUNNEL_GENERATION)
export class FunnelGenerationProcessor {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly context: LoggerContextService,
  ) {}

  @Process(JOBS.GENERATE_FUNNEL)
  async handle(job: Job<GenerateFunnelJobPayload>): Promise<void> {
    // Open a fresh ALS context with job fields
    await this.context.run(
      {
        requestId: null,              // no HTTP request in this context
        jobId:     job.id,
        queue:     QUEUES.FUNNEL_GENERATION,
        attempt:   job.attemptsMade + 1,
      },
      async () => {
        // All logger calls inside here automatically carry jobId, queue, attempt
        this.logger.info('funnel.job.received', { funnelId: job.data.funnelId });
        // ... rest of processing
      },
    );
  }
}
```

**Linking a job back to the HTTP request that created it:**

Log the `jobId` at the dispatch point while still inside the HTTP ALS context. That
single log line carries both `requestId` and `jobId`, creating the link between the
two trace chains.

```typescript
// In OnboardingService — still inside the HTTP request, requestId is in ALS
const job = await this.queue.add(JOBS.GENERATE_FUNNEL, payload);
this.logger.info('onboarding.completed', { funnelId, jobId: job.id });
//                                                      ↑ links HTTP trace to job trace
```

---

## 10. Enriching context mid-request

Once the user is authenticated, enrich the ALS context so all subsequent log lines
in the same request automatically carry `userId` and `sessionId`.

```typescript
// In AuthGuard or AuthService, after identity is confirmed
this.context.setUserId(user.id);       // raw ID — masked to usr_****xxxx on log write
this.context.setSessionId(session.id); // raw ID — masked to sess_****xxxx on log write
```

These methods mutate the existing ALS store in place. All subsequent `logger.*()` calls
in the same request chain will include the masked values without any extra work.

**Available context methods:**

| Method | When to call |
|--------|-------------|
| `setUserId(userId)` | After identity is confirmed in `AuthGuard` |
| `setSessionId(sessionId)` | After session is created or validated |
| `setJobContext(jobId, queue, attempt?)` | Only for enriching an HTTP context that dispatches a job inline — do not use in processors, use `run()` instead |

---

## 11. Log levels and environment config

Add to your `.env` or `.env.local`:

```bash
LOG_LEVEL=info        # debug | info | warn | error  (default: info)
NODE_ENV=development  # development activates pino-pretty; anything else outputs raw JSON
```

| Level | What is emitted | Use when |
|-------|-----------------|----------|
| `debug` | Everything including LLM prompt summaries | Local development only |
| `info` | Standard operational logs | Default — all environments |
| `warn` | Warnings and errors only | - |
| `error` | Errors only | - |

> **Never set `LOG_LEVEL=debug` in production.** Debug output may include LLM prompt
> summaries and other sensitive operational data.

**Development — `NODE_ENV=development`** activates `pino-pretty`:

```
09:14:22 INFO  auth.login.success
  userId: "usr_****1234"
  requestId: "a3f1b2c3-d4e5-6789-abcd-ef0123456789"
```

**All other environments** — raw JSON per line, suitable for log aggregators:

```json
{"event":"auth.login.success","level":"info","timestamp":"2026-05-19T09:14:22.001Z","service":"flowbrand-api","env":"production","requestId":"a3f1b2c3-...","userId":"usr_****1234"}
```

**Verifying all output is valid JSON:**

```bash
pnpm start | jq .
# Zero non-JSON lines = AC-01 passes
```

---

## 12. Event name catalog

Event names use `domain.noun.verb` dot notation. Use these exactly. Do not invent
names without updating this catalog in the same PR.

### HTTP — emitted automatically by `LoggingInterceptor`

> Do not call these manually.

| Event | Level | When |
|-------|-------|------|
| `http.request.received` | info | Every inbound request |
| `http.request.completed` | info | 2xx / 3xx response sent — includes `durationMs`, `statusCode` |
| `http.request.rejected` | warn | 4xx response |
| `http.request.error` | error | 5xx response |

### Auth — `AuthService` + `AuthGuard`

| Event | Level | When |
|-------|-------|------|
| `auth.register.success` | info | User created |
| `auth.register.duplicate` | warn | Email already exists (409) |
| `auth.login.success` | info | Credentials verified, session created |
| `auth.login.failed` | warn | Wrong password |
| `auth.login.locked` | warn | Account locked — include `unlocksAt` |
| `auth.logout.success` | info | Session revoked |
| `auth.token.refreshed` | info | Access token rotated |
| `auth.token.refresh_failed` | warn | Invalid or expired refresh token |
| `auth.session.not_found` | warn | JWT valid but no Redis session |
| `auth.session.created` | info | Session persisted to Redis + DB |
| `auth.otp.sent` | info | OTP queued for delivery |
| `auth.otp.resent` | info | OTP resend queued |
| `auth.otp.verified` | info | OTP accepted, user marked verified |
| `auth.otp.invalid` | warn | Wrong OTP — include `attemptsRemaining` |
| `auth.otp.expired` | warn | OTP TTL elapsed |
| `auth.otp.rate_limited` | warn | Rate limit hit — include `retryAfterMs` |
| `auth.google.callback` | info | OAuth profile received — include `provider: 'google'` |
| `auth.google.account_linked` | info | Existing user linked to Google |
| `auth.google.account_created` | info | New user created via Google |
| `auth.google.conflict` | warn | Email exists under different provider |

### Users — `UsersService`

| Event | Level | When |
|-------|-------|------|
| `user.created` | info | New user record inserted |
| `user.updated` | info | Profile fields changed |
| `user.deleted` | info | Soft delete applied |
| `user.fetch.not_found` | warn | GET by ID — record missing |

### Onboarding — `OnboardingService`

| Event | Level | When |
|-------|-------|------|
| `onboarding.session.started` | info | New wizard session created |
| `onboarding.session.resumed` | info | Existing in-progress session returned |
| `onboarding.session.expired` | warn | Session TTL elapsed on fetch |
| `onboarding.session.already_complete` | warn | POST /complete on finished session |
| `onboarding.completed` | info | Wizard finished, funnel job enqueued — include `funnelId` |

### Funnel generation — `FunnelGenerationProcessor`

| Event | Level | When |
|-------|-------|------|
| `funnel.job.received` | info | Job dequeued (`@OnQueueActive`) |
| `funnel.job.completed` | info | Full pipeline succeeded |
| `funnel.job.failed` | error | Job failed after attempt — include `willRetry` |
| `funnel.job.stalled` | warn | Bull stall detected |
| `funnel.job.skipped` | info | Funnel already ACTIVE — idempotency guard |
| `funnel.job.not_found` | error | Funnel row missing at job start |
| `funnel.llm.gemini.failed` | warn | Gemini call threw or timed out — include `durationMs` |
| `funnel.llm.groq.failed` | warn | Groq call threw or timed out — include `durationMs` |
| `funnel.llm.success` | info | Provider succeeded — include `provider`, `durationMs` |
| `funnel.template.used` | info | Both LLMs failed, fell back to template |
| `funnel.validation.failed` | error | `validateStageData` rejected output — include `reason` |
| `funnel.write.committed` | info | QueryRunner transaction committed |
| `funnel.write.rolled_back` | error | Transaction rolled back — include `reason` |
| `funnel.status.failed` | error | Funnel marked FAILED in DB |
| `funnel.status.active` | info | Funnel marked ACTIVE in DB |

### Email — `EmailProcessor`

| Event | Level | When |
|-------|-------|------|
| `email.job.received` | info | Job dequeued |
| `email.job.completed` | info | Resend accepted — include `resendId`, `type`, `durationMs` |
| `email.job.failed` | error | Resend rejected or threw — include `willRetry` |
| `email.job.stalled` | warn | Bull stall detected |
| `email.job.dead_lettered` | error | All retries exhausted |
| `email.queued` | info | `EmailService.dispatch()` enqueued job |
| `email.queue.failed` | error | Dispatch threw (Redis down) |

> **PII rule:** `to` must always be masked — `maskEmail(to)` — in all email events.

### Redis — `RedisService`

| Event | Level | When |
|-------|-------|------|
| `redis.connected` | info | Connection established |
| `redis.ready` | info | Client ready for commands |
| `redis.disconnected` | warn | Connection closed |
| `redis.reconnecting` | warn | Retry attempt — include `attempt`, `delayMs` |
| `redis.error` | error | Client error — include `isOom: boolean` |
| `redis.command.failed` | error | Any operation threw — include `command` |
| `redis.rate_limit.exceeded` | warn | Key exceeded threshold — include key pattern, not raw value |
| `redis.pattern.deleted` | info | `delByPattern()` resolved — include `count`, `pattern` |

### Health — `HealthController`

| Event | Level | When |
|-------|-------|------|
| `health.check.ok` | info | Both services up |
| `health.check.degraded` | warn | Any service down — include `services: { database, queue }` |
| `health.db.timeout` | warn | DB check exceeded 2s |
| `health.queue.timeout` | warn | Queue check exceeded 2s |

### External integrations

| Event | Level | When |
|-------|-------|------|
| `resend.send.success` | info | Email accepted — include `resendId` |
| `resend.send.failed` | error | Resend returned error — include `type`, not recipient |
| `google.oauth.token_exchanged` | info | Code exchanged for tokens |
| `llm.gemini.request` | info | Call started — include `durationMs` on resolution |
| `llm.groq.request` | info | Call started |
| `minio.upload.success` | info | Object stored — include `bucket`, `key`, `sizeBytes` |
| `minio.upload.failed` | error | Storage call threw |
| `minio.delete.success` | info | Object removed |
| `minio.delete.failed` | error | Remove call threw |

### Bootstrap — `main.ts`

| Event | Level | When |
|-------|-------|------|
| `app.started` | info | `app.listen()` resolved — include `port`, `env` |
| `app.swagger.enabled` | info | Swagger registered — include `docsUrl` |
| `app.exception.unhandled_rejection` | error | `process.on('unhandledRejection')` |
| `app.exception.uncaught` | error | `process.on('uncaughtException')` |

---

## 13. Rules enforced at code review

PRs that violate these will not be merged.

### Never

```typescript
// console.log — bypasses Pino, no JSON, no requestId, no level control
console.log('something happened');

// NestJS built-in Logger — not Pino, not JSON, no requestId
private readonly logger = new Logger(MyService.name);

// Raw Error inside data — serialises as {} in JSON
this.logger.error('funnel.job.failed', { error: err });

// Unmasked userId
this.logger.info('auth.login.success', { userId: user.id });

// Unmasked email
this.logger.info('email.queued', { to: recipient.email });

// Any secret
this.logger.debug('llm.call', { apiKey: process.env.GEMINI_API_KEY });

// Request body — may contain passwords or OTP codes
this.logger.info('http.request.received', { body: req.body });

// Invented event name not in the catalog
this.logger.info('myService.didSomething', {});
```

### Always

```typescript
// Inject PinoLoggerService
constructor(private readonly logger: PinoLoggerService) {}

// Use event names from the catalog exactly
this.logger.info('auth.login.success', { userId: maskId(user.id) });

// Pass Error as third argument
this.logger.error('funnel.write.rolled_back', { jobId, funnelId }, err);

// Mask all PII at the call site
this.logger.info('email.queued', { to: maskEmail(recipient), type });

// Start fresh ALS context in queue processors
await this.context.run({ requestId: null, jobId: job.id, queue }, async () => {
  // log calls here
});

// Add new sensitive fields to pino.logger.ts redact.paths in the same PR
```

---

## 14. Acceptance criteria

| AC | Check | How to verify |
|----|-------|---------------|
| AC-01 | Every log line is valid JSON | `pnpm start \| jq .` — zero non-JSON lines |
| AC-02 | All lines for one request share the same `requestId` | Hit `POST /funnels/generate`, grep logs for the returned UUID |
| AC-03 | `X-Request-ID` is echoed in the response header | `curl -H "X-Request-ID: <uuid>"` and inspect response headers; also test without the header |
| AC-04 | Sensitive fields output `[REDACTED]` | Unit test: `{ password: 'secret', nested: { token: 'abc' } }` → both `[REDACTED]` |
| AC-05 | Full generation job emits all expected events in order | `http.request.received` → `funnel.job.received` → `funnel.llm.success` → `funnel.write.committed` → `funnel.status.active` → `http.re
| AC-06 | `GEMINI_API_KEY` never appears in any log line | `grep GEMINI_API_KEY <logfile>` returns nothing after a generation request |
| AC-07 | `LOG_LEVEL=error` suppresses info and warn | `LOG_LEVEL=error pnpm start` — only error-level lines appear |
| AC-08 | HTTP interceptor does not log request bodies | Send `{ "password": "test" }` in body — confirm it does not appear in logs |
| AC-09 | `maskId` and `maskEmail` produce correct output | Unit tests in `pii.spec.ts` |
| AC-10 | No `console.log` in target files | `grep -r "console\.log" src/modules src/common` returns nothing |
