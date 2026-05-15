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

### 6. Testing Proof Is Required in Every PR

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

- PR titles must follow the Conventional Commits format used for commits.
- Include the ticket number if applicable.

### Examples

- `feat(auth): BE-1234 add Google OAuth strategy`
- `fix(funnels): BE-5678 correct pagination logic`
- `docs: restructure contributing guide`

> A clear title makes it easier for reviewers to understand the purpose of the PR at a glance.

## Reporting Issues

When filing an issue, include:

- Clear reproduction steps
- Expected vs actual behavior
- Environment details (Node version, OS, DB)
- Relevant logs or error output

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
All contributors are expected to uphold respectful, inclusive, and professional interactions.
