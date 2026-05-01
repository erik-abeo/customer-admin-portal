# Contributing to Customer Admin Portal

Thanks for your interest in contributing! This guide covers everything you
need to know to set up a working environment, follow our conventions, and get
your changes merged.

## Quick start

```bash
# Prerequisites: Node 22 (see .nvmrc)
nvm use
npm ci
cp .env.example .env.local
# Fill in VITE_API_BASE_URL and any feature flags
npm run dev
```

Then open http://localhost:5173 and sign in with the API key your environment
has been issued.

## Development scripts

| Command             | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server with HMR                                |
| `npm run build`     | Production build (output in `dist/`)                              |
| `npm run preview`   | Serve the production build locally                                |
| `npm run lint`      | ESLint over the source tree                                       |
| `npm run typecheck` | `tsc --noEmit` for `tsconfig.app.json`                            |
| `npm run format`    | Apply Prettier formatting                                         |
| `npm run test`      | Vitest unit + component tests                                     |
| `npm run test:e2e`  | Playwright end-to-end tests (auto-starts a build via `e2e:serve`) |

## Project layout

```
src/
  api/          HTTP client, typed endpoint wrappers, AuthStrategy interface
  auth/         AuthContext, role hooks, idle sign-out, redirect safety
  components/
    common/     Reusable UI building blocks (PageHeader, QueryStatus, …)
    layout/     AppLayout, RootErrorBoundary
  config/       Environment validation (env.ts)
  features/     Feature folders. Each has queries.ts (TanStack Query) +
                Form.tsx (Mantine forms).
  lib/          Cross-cutting utilities (csv, listTable, validators, …)
  pages/        Route components — one file per route
  styles/       Global CSS (theme tokens live in src/theme.ts)
  test/         Test setup + render helpers
e2e/            Playwright suites + mock API helpers
deploy/         Dockerfile, Nginx config, AWS / Terraform artifacts
```

## Conventions

### TypeScript

- Strict mode is on. Avoid `any`. Prefer narrow union types over enums.
- Use `import type { … }` for type-only imports — this keeps the bundler
  output tighter.
- Backend response types are colocated in `src/api/types.ts` and exactly
  mirror the C# DTOs (PascalCase property names — yes, even in TS).

### React / Mantine

- Every list page composes `useListTable` + `ListToolbar` + `ListPagination`
  - `SortableHeader`. Don't roll your own filter/sort logic; extend the hook
    if a new pattern emerges.
- Every page renders inside `<Container size="xl">` and starts with a
  `<PageHeader>`.
- Forms use `@mantine/form` and the validators in `src/lib/validators.ts`.
  If you need a new shape (e.g. UUID, ISO date), add it there, not inline.
- Server state lives in TanStack Query. Local UI state lives in `useState`.
  Don't mix the two.
- Loading uses `<QueryStatus>`. Pass `loadingSkeleton.columnWidths` matching
  the real columns to avoid layout shift on data arrival.

### Styling

- Color tokens are defined in `src/theme.ts` (`crystal` palette + neutrals).
  Use `var(--mantine-color-*)` in CSS and `c="crystal.6"` in JSX.
- Every interactive surface needs a visible `:focus-visible` outline.
- All animations / transitions must respect `prefers-reduced-motion`. The
  global guard in `src/styles/global.css` handles most cases automatically.

### Accessibility

- Headings increase by at most one level. The `heading-order` axe rule is
  enforced in the E2E suite.
- Every interactive element needs an accessible name (`aria-label` if no
  visible text).
- Skip-to-content link is provided by `AppLayout`. New full-page layouts
  must keep `id="main"` on the main landmark.

### Tests

- Unit tests live alongside the file under test (`x.ts` ↔ `x.test.ts`).
- Component tests live alongside the component (`x.tsx` ↔ `x.test.tsx`)
  and render via `renderWithProviders` from `src/test/`.
- E2E tests live in `e2e/`. They mock the API via `installApiMocks` and
  pre-seed `sessionStorage` to skip the login screen.
- Aim for one E2E test per user-visible flow (e.g. "create a server",
  "filter the user list"). Keep the per-page interaction count small —
  E2E is for proving the wiring, not for testing component logic.

### Commits and pull requests

- Use small, focused commits with imperative subject lines (`Add idle
sign-out`, not `Added` or `Adding`).
- Reference Jira tickets in the body when relevant.
- Call out user-visible changes in the PR description so the release
  notes are easy to assemble.

## Definition of done

A change is ready to merge when:

1. `npm run lint` passes (no warnings)
2. `npm run typecheck` passes
3. `npm run format:check` passes
4. `npm run test` passes (no skipped or `.only` tests)
5. `npm run test:e2e` passes locally and in CI
6. Lighthouse CI passes on `/login` (the unauthenticated baseline)
7. The diff includes any necessary test updates

## Getting help

If you get stuck, open a draft PR and tag a maintainer. We'd much rather
review an in-progress branch than have you spin in private.
