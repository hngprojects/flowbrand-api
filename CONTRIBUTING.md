# Contributing

Thanks for contributing to **SEIL API**! This guide covers setup, branching, commits, and the PR workflow.

## Prerequisites

- Node.js 20+
- pnpm 9+ (preferred). If you use npm/yarn, translate commands accordingly.
- PostgreSQL 14+ for local development

## Getting started

1. Fork the repo and clone your fork.

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create your environment file:

   ```bash
   cp .env.example .env
   ```

4. Create the database and run migrations:

   ```bash
   createdb nestjs_starter
   pnpm migration:run
   ```

5. (Optional) Seed data:

   ```bash
   pnpm seed
   ```

6. Run the app:

   ```bash
   pnpm start:dev
   ```

## Branching

- **Main branch:** `dev` — all PRs target `dev`
- **Feature branches:** `feat/BE-<ticket>-<short-name>`
- **Bug fix branches:** `fix/BE-<ticket>-<short-name>`
- Names must be lowercase kebab-case.
- Examples:
  - `feat/BE-003-google-oauth`
  - `feat/BE-005-onboarding-intake`
  - `fix/BE-002-login-refresh`
- Keep branches focused. If a change touches unrelated concerns, split it.
- Rebase or merge `dev` regularly to reduce conflicts.

## Commits

Use **Conventional Commits** (<https://www.conventionalcommits.org>):

```text
type(scope)!: short summary
```

- `scope` and `!` are optional.
- Use `!` or a `BREAKING CHANGE:` footer for breaking changes.

**Allowed types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

Examples:

- `feat(auth): add Google OAuth strategy`
- `fix(funnels): handle missing stage on generation`
- `docs(readme): clarify setup`
- `refactor(users)!: drop legacy profile fields`

Guidelines:

- Use the **imperative** mood ("add", not "added").
- Keep the subject line ≤ 72 characters and do not end with a period.
- Scope is optional but encouraged for clarity (module or domain).
- Use footers to reference issues:
  - `Refs: #123`
  - `Closes #456`

## Code style

- Run formatting and linting before pushing:

  ```bash
  pnpm format
  pnpm lint
  ```

- Follow existing patterns in `src/common` and `src/modules`.
- Prefer small, composable services and keep controllers thin.

## Tests

Run the suite locally before opening a PR:

```bash
pnpm test
pnpm test:e2e
pnpm build
```

If you add or change behavior, include or update tests.

## Database and migrations

- **Do not** enable schema sync in non-dev environments.
- For schema changes:
  1. Update entities.
  2. Generate a migration:

     ```bash
     pnpm migration:generate src/database/migrations/<Name>
     ```

  3. Apply it:

     ```bash
     pnpm migration:run
     ```

## Pull requests

Before opening a PR:

- Ensure `pnpm lint`, `pnpm build`, and relevant tests pass.
- Keep changes minimal and aligned with the PR title.
- Update docs when behavior or configuration changes.

PR expectations:

- Describe **what** changed and **why**.
- Link related issues or discussions.
- Mark as **draft** if work is incomplete.
- Be responsive to review feedback.

## Reporting issues

When filing an issue, include:

- Clear reproduction steps
- Expected vs actual behavior
- Environment details (Node version, OS, DB)
- Relevant logs or error output
