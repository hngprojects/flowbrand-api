# Contributing to SEIL API

Thank you for your interest in contributing to **SEIL API**.
We welcome all contributions: bug reports, feature proposals, documentation updates, and code improvements.
Your participation helps keep the platform smarter, more reliable, and more impactful.

## Getting Started

### 1. Clone the repository

This project uses a shared-repo workflow. If you have write access to `hngprojects/flowbrand-api`, clone the repo directly and branch off `dev`. External contributors without write access can fork ins

```sh
git clone https://github.com/hngprojects/flowbrand-api.git
```

### 2. Navigate into the project directory

```sh
cd flowbrand-api
```

### 3. Install dependencies

This project uses **pnpm 9+**. Translate any `npm`/`yarn` commands accordingly.

```sh
pnpm install
```

### 4. Configure your environment

```sh
cp .env.example .env
```

Fill in your database credentials and at least 32-character JWT secrets. The app validates env at boot via `@t3-oss/env-core` + Zod and fails fast on missing or invalid values.

### 5. Create the database and run migrations

```sh
createdb nestjs_starter
pnpm migration:run
```

### 6. (Optional) Seed an admin user

```sh
pnpm seed
```

### 7. Start the development server

```sh
pnpm start:dev
```

Open `http://localhost:3000/docs` for the Swagger UI.

## How to Contribute

### Reporting Bugs

If you discover a bug:

- Open an issue on [GitHub Issues](https://github.com/hngprojects/flowbrand-api/issues).
- Provide detailed steps to reproduce the bug.
- Include expected vs. actual behavior.
- Attach logs, screenshots, or error messages when possible.
- Clear bug reports help us resolve issues faster.

### Suggesting Features

Have an idea that would improve SEIL API?

- Create a feature request on [GitHub Issues](https://github.com/hngprojects/flowbrand-api/issues).
- Describe the feature clearly and explain its value.
- Share how you imagine it should behave or integrate with existing features.
- Thoughtful feature suggestions help drive meaningful improvements.

### Code Contributions

Before writing any code:

- Pick up or create a ticket so the work has a tracked reference (`BE-<num>`).
- Confirm the change does not overlap with an in-flight branch on `origin`.
- Branch from `dev`. All PRs target `dev`.

> We follow a structured workflow to keep contributions organized and easy to review.

## Development Workflow

1. **Create a new branch for your work:**

   ```sh
   git checkout dev
   git pull origin dev
   git checkout -b feat/BE-1234-your-feature-name
   ```

2. Make your changes. Keep the branch focused; split unrelated work into its own branch.

3. **Commit your updates** using Conventional Commits:

   ```sh
   git commit -m "feat(auth): add Google OAuth strategy"
   ```

4. Push your branch to `origin` (which is the upstream repo):

   ```sh
   git push origin <your-branch>
   ```

## Coding Standards & PR Requirements

To keep the codebase clean, scalable, and predictable, the following standards are mandatory for every contribution.

### 1. Use `HttpStatus` (NestJS): No Hardcoded Status Codes

Bad:

```ts
return {
  status_code: 200,
  message: 'Account Created Successfully',
  data: { id: 'uuid' },
};
```

Good:

```ts
import { HttpStatus } from '@nestjs/common';
import * as SYS_MSG from '../../constants/system.messages';

return {
  status_code: HttpStatus.CREATED,
  message: SYS_MSG.USER_CREATED_SUCCESSFULLY,
  data: { id: 'uuid' },
};
```

### 2. Use System Message Constants (No Free-Text Messages)

Source of truth: `src/constants/system.messages.ts`.

Bad:

```ts
message: 'Account created successfully';
```

Good:

```ts
message: SYS_MSG.USER_CREATED_SUCCESSFULLY;
```

### 3. No `any` Allowed in the Codebase

Before any PR is merged, the codebase must contain zero `any` types in:

- DTOs
- Services
- Controllers
- Helpers and utilities

Use proper typing instead:

```ts
async findUserById(id: string): Promise<User> {
  // implementation
}
```

### 4. Strongly Typed Controller and Service Method Signatures

Example for an authentication flow:

```ts
async register(
  registerDto: RegisterDto,
): Promise<BaseResponse<RegisterResponse>> {
  // implementation
}
```

### 5. Use the Repository Pattern via `@hng-sdk/orm`

Services must not depend on TypeORM `Repository<T>` directly. Each entity gets a `*ModelAction` class that extends `AbstractModelAction<T>`:

```ts
@Injectable()
export class UserModelAction extends AbstractModelAction<User> {
  constructor(@InjectRepository(User) repository: Repository<User>) {
    super(repository, User);
  }
}
```

Services depend on the model action, not the repository.

### 6. Controller Return Shapes — Let the Interceptor Do the Wrapping

All controllers go through `TransformInterceptor`, which produces the consistent envelope:

```json
{ "success": true, "statusCode": 200, "message": "...", "data": <payload> }
```

**Never call `res.json()` directly** unless the endpoint performs a `res.redirect()`. Never include `success: true` in what you return — the interceptor adds it, and if you include it manually it le

#### Shape A — Structured with data ✅ (most endpoints)

Use when you need an explicit message *and* a data payload.

```ts
return {
  statusCode: HttpStatus.OK,
  message: SYS_MSG.AUTH_LOGIN_SUCCESSFUL,
  data: { accessToken, user },
};
// → { "success": true, "statusCode": 200, "message": "...", "data": { "accessToken": "..." } }
```

#### Shape B — Structured without data ✅ (message-only responses)

Omit the `data` key; the interceptor fills it with `null`.

```ts
return { statusCode: HttpStatus.OK, message: SYS_MSG.OTP_SENT_SUCCESSFULLY };
// → { "success": true, "statusCode": 200, "message": "...", "data": null }
```

#### Shape C — Plain service result ✅ (pass-through)

Use when the service already returns the payload and no custom message is needed.

```ts
return this.usersService.findById(userId);
// → { "success": true, "statusCode": 200, "message": "Operation successful", "data": { "id": "..." } }
```

#### Shape D — Pagination ✅ (existing convention, unchanged)

```ts
return { paginationMeta: { ... }, payload: [...] };
// → { "success": true, "statusCode": 200, "message": "Operation successful", "data": [...], "meta": { ... } }
```

#### Rules and gotchas

- **Shape A/B requires BOTH `statusCode` AND `message`.** Without `message`, the interceptor treats the whole object as Shape C data, causing `body.data.statusCode` instead of `body.statusCode`.
- **Use `@Res({ passthrough: true })`** only when you must call `res.cookie()`, `res.clearCookie()`, or `res.status()` (dynamic status). Then `return` the structured object and the interceptor still f
- **Keep plain `@Res()`** (without passthrough) only for `res.redirect()` endpoints — these bypass the interceptor entirely.
- **Keep `@HttpCode()` in sync** with the `statusCode` field you return. The JSON `statusCode` comes from your return value; the HTTP status header comes from `@HttpCode()` or `res.status()`. They mus

**Dynamic-status pattern example** — when the service decides the status code (202 for a new job, 200 for an idempotent repeat):

```ts
@Post('generate')
@CreateFunnelDocs()
async generate(
  @CurrentUser('userId') userId: string,
  @Body() dto: CreateFunnelDto,
  @Res({ passthrough: true }) res: Response,
) {
  const result = await this.service.generate(userId, dto);
  // Set the HTTP status header to match the body — 202 ACCEPTED or 200 OK
  res.status(result.statusCode);
  return {
    statusCode: result.statusCode, // 202 | 200
    message: result.message,
    data: { id: result.id, status: result.status },
  };
}
// → HTTP 202  { "success": true, "statusCode": 202, "message": "...", "data": { ... } }
// → HTTP 200  { "success": true, "statusCode": 200, "message": "...", "data": { ... } }
```

### 7. Domain Events — Emit Timing and Listener Safety

This codebase uses `EventEmitter2` for in-process domain events. Three rules are mandatory for any code that emits or listens.

#### Rule 1 — Emit AFTER the transaction commits, never inside it

If a transaction rolls back after `emit()` fires, listeners have already acted on data that no longer exists.

```ts
// CORRECT — emit after commit
await queryRunner.commitTransaction();
this.eventEmitter.emit(APP_EVENTS.STAGE_COMPLETED, new StageCompletedEvent(...));

// WRONG — transaction may roll back after this line
await queryRunner.manager.save(stage);
this.eventEmitter.emit(APP_EVENTS.STAGE_COMPLETED, new StageCompletedEvent(...));
```

#### Rule 2 — Listeners must wrap all logic in try/catch and never rethrow

`EventEmitter2` is synchronous. An uncaught exception in a listener propagates directly to the service that called `emit()` and can kill a user-facing request. Activity logging, notifications, and ana

> **Fire-and-forget**: `emit()` returns before any `async` listener settles. This means `ignoreErrors` only catches synchronous throws — async listener rejections become unhandled promise rejections

```ts
@OnEvent(APP_EVENTS.STAGE_COMPLETED)
async handleStageCompleted(event: StageCompletedEvent): Promise<void> {
  // emit() is fire-and-forget — this method runs after the caller has already returned.
  // Any rejection here is an unhandled promise rejection if not caught below.
  try {
    await this.activityAction.create({ ... });
  } catch (err) {
    this.logger.error({ message: 'Activity write failed', error: (err as Error).message });
    // Never rethrow here.
  }
}
```

#### Rule 3 — No PII in event payloads

Event payloads can end up in activity logs and notification metadata. Do not include `email`, `password_hash`, `token_hash`, `refresh_token`, or `provider_user_id` in any event class. A `userId` UUID 

`business_name` is acceptable in event payloads (e.g. `FunnelGeneratedEvent`) because it serves a legitimate operational purpose — activity logs need it for display. Be aware that sole proprietors s

### 8. Testing Proof Is Required in Every PR

Every PR must include at least one of the following:

- Screenshot of Swagger UI showing the tested endpoint
- OR Postman screenshot showing request + response

> PRs without test evidence **will not be reviewed or merged.**

## Branch Naming Rules

Branches follow this structure:

```sh
<type>/<ticket-or-issue-number>-short-description
```

### Valid types

- `feat/`: new features
- `fix/`: bug fixes
- `refactor/`: code restructuring without changing behavior
- `chore/`: maintenance tasks (dependencies, configs, CI, etc.)
- `docs/`: documentation updates
- `style/`: formatting only changes
- `perf/`: performance work
- `test/`: test additions or updates
- `build/`: build system changes
- `ci/`: CI configuration changes

### Rules

- Include the ticket number when one exists (`BE-<num>`).
- Use a short, clear, lowercase, kebab-case description.

#### Example with ticket

```sh
feat/BE-003-google-oauth
```

#### Example without ticket

```sh
docs/restructure-contributing-guide
```

## Commit Message Rules

This repository uses **Conventional Commits** (<https://www.conventionalcommits.org>) and enforces them with commitlint.

Format:

```text
type(scope)!: short summary
```

- `scope` and `!` are optional.
- Use `!` or a `BREAKING CHANGE:` footer for breaking changes.

### Allowed types

`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

### Examples

- `feat(auth): add Google OAuth strategy`
- `fix(funnels): handle missing stage on generation`
- `docs(readme): clarify setup`
- `refactor(users)!: drop legacy profile fields`

### Rules to follow

- Use the **imperative** mood ("add", not "added").
- Keep the subject line within 72 characters and do not end with a period.
- Scope is optional but encouraged for clarity (module or domain).
- Use footers to reference issues:
  - `Refs: #123`
  - `Closes #456`

## Swagger Documentation

Every module keeps its Swagger decorators in a dedicated file:

```text
src/modules/<name>/docs/<name>-swagger.doc.ts
```

Each endpoint gets its own decorator factory using `applyDecorators`. The controller imports and applies these, keeping the controller file clean.

```ts
// src/modules/auth/docs/auth-swagger.doc.ts
import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LoginDto } from '../dto/login.dto';

export function LoginDocs() {
  return applyDecorators(
    HttpCode(HttpStatus.OK),
    ApiOperation({ summary: 'Login with email and password' }),
    ApiBody({ type: LoginDto }),
    ApiResponse({
      status: HttpStatus.OK,
      description:
        'Returns JWT access token and user. Refresh token set as HttpOnly cookie.',
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid email or password.' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Account locked.' }),
  );
}
```

```ts
// src/modules/auth/auth.controller.ts
import { LoginDocs } from './docs/auth-swagger.doc';

@LoginDocs()
@Post('login')
login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

Rules:

- One factory per endpoint, named after the operation (`LoginDocs`, `RegisterDocs`, etc.).
- Always document every `ApiResponse` status the endpoint can return.
- For endpoints that set HttpOnly cookies, note it in the `description`. Swagger cannot demonstrate cookies via "Try it out".
- For OAuth redirect endpoints, add a `description` explaining they cannot be tested via Swagger and must be opened directly in a browser.

## Code Style

Run formatting and linting before pushing:

```sh
pnpm format
pnpm lint
```

- Follow existing patterns in `src/common` and `src/modules`.
- Prefer small, composable services and keep controllers thin.

### JSDoc on exported service methods

Every public method on an exported service must have a one-line JSDoc comment. This is what populates IDE tooltips and makes the module's public API navigable without reading the implementation.

```ts
/** Registers a new user, hashes their password, and dispatches a verification OTP. */
async register(dto: RegisterDto): Promise<{ message: string }> {
  // ...
}

/** Validates credentials, enforces lockout policy, and issues JWT + refresh token. */
async login(dto: LoginDto): Promise<AuthResponse> {
  // ...
}
```

You don't need `@param` or `@returns` tags if the types are already annotated. The one-liner is enough. Private methods and internal helpers don't require JSDoc.

## Tests

Run the suite locally before opening a PR:

```sh
pnpm test
pnpm test:e2e
pnpm build
```

If you add or change behavior, include or update tests.

## Database and Migrations

- **Do not** enable schema sync in non-dev environments.
- For schema changes:
  1. Update entities.
  2. Generate a migration:

     ```sh
     pnpm migration:generate src/database/migrations/<Name>
     ```

  3. Apply it:

     ```sh
     pnpm migration:run
     ```

## Submitting Pull Requests

1. Make sure your branch is current with `dev` before opening a PR. Pull the latest `dev` into your branch (merge or rebase, per your preference) and resolve conflicts locally.

2. Run the local checks:

   ```sh
   pnpm lint
   pnpm build
   pnpm test
   pnpm test:e2e
   ```

   > Always ensure these pass before submitting a PR.

3. Run the local security scan:

   ```sh
   bash scripts/forbidden-pattern-scan.sh .
   ```

   CI runs the same scan plus the org's vulnerability scanner on every push and PR.

4. Submit a pull request from your branch to the `dev` branch of `hngprojects/flowbrand-api`.

5. Fill out [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) completely:
   - Describe **what** changed and **why**.
   - Link the related issue or ticket.
   - Attach the required test evidence screenshot.
   - Mark the PR as **draft** if work is incomplete.
   - Be responsive to review feedback.

## Pull Request Title Rules

PR titles must follow the same Conventional Commits format as commit messages. The title is the first thing a reviewer reads — get it right.

### Format

```text
type(scope): BE-<num> short description in imperative mood
```

- `type` is lowercase: `feat`, `fix`, `refactor`, `docs`, `chore`, etc.
- `scope` is the module or domain in lowercase: `auth`, `funnels`, `upload`, etc.
- Include the ticket number when one exists.

### Correct Examples

- `feat(auth): BE-1234 add Google OAuth strategy`
- `fix(funnels): BE-5678 correct pagination offset cap`
- `refactor(api): normalise response envelope across all controllers`
- `docs: restructure contributing guide`

### Wrong — flagged in review

| Bad title | Problem |
| --- | --- |
| `Feat(funnel): implement funnel display APIs` | Capital `F` — type must be lowercase |
| `Feature/BE-307-funnel-list` | Branch-name pasted as PR title — no colon, no description |
| `feat(funnel): implement funnel display APIs` | "implement ... APIs" is vague — name the specific change |

The branch name is **not** the PR title. Write a fresh, human-readable summary.

> A clear title lets reviewers understand the scope at a glance and makes the git log useful.

## Reporting Issues

When filing an issue, include:

- Clear reproduction steps
- Expected vs actual behavior
- Environment details (Node version, OS, DB)
- Relevant logs or error output

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
All contributors are expected to uphold respectful, inclusive, and professional interactions.
