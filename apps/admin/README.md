# @ctv-platform/admin

Administration Dashboard for the CTV Platform (Milestone 6), built with
Next.js (Pages Router), TypeScript, Material UI, TanStack Query, React Hook
Form, Zod, and Recharts — per `specification/03-Technology-Stack.md.txt`.

Talks exclusively to `apps/backend` (Milestone 5) over HTTP; it does not
import any workspace package directly (`@ctv-platform/domain`, etc.) since
it is a separately deployable client, not a server process.

See `specification/11-Admin-Dashboard.md.txt` and
`specification/24-AI-Memory.md.txt` (Milestone 6 Update) for the full
requirements and implementation notes.

## Running

```bash
pnpm --filter @ctv-platform/admin dev     # http://localhost:3001
pnpm --filter @ctv-platform/admin build
pnpm --filter @ctv-platform/admin start
```

Requires `NEXT_PUBLIC_API_BASE_URL` (see `.env.example` at the repo root;
defaults to `http://localhost:3000/api/v1`, matching the Milestone 5
backend's default `API_PREFIX`) and the backend itself running.

## Sections

- **Dashboard** (`/`, ADMIN) — catalog/user counts, catalog composition
  chart, provider status, and placeholders for recent imports/errors (not
  tracked by the backend yet).
- **Movies** (`/movies`, `/movies/[id]`) — search/sort/paginate, details,
  streams, subtitles, images.
- **TV Shows** (`/shows`, `/shows/[id]`, `/shows/[id]/seasons/[seasonId]`,
  `/episodes/[id]`) — same, plus seasons/episodes drill-down.
- **Providers** (`/providers`, ADMIN) — registered providers joined with
  live health, manual discovery trigger (real), enable/disable/reload
  (typed stubs).
- **Import Jobs** (`/import-jobs`, ADMIN) — job table with retry/cancel/
  restart/export actions (typed stubs — no job history persistence yet).
- **Synchronization** (`/synchronization`, ADMIN) — real manual discovery
  per provider, plus full/incremental sync and refresh actions and queue
  monitoring stats (typed stubs).
- **Health Monitoring** (`/health`, ADMIN) — real backend `/health` (DB/
  Redis/version/uptime) and live provider availability.
- **Users** (`/users`, ADMIN) — list/search/paginate (real), edit role +
  active status (real, `PATCH /admin/users/:id`), create/delete/reset
  password (typed stubs).
- **Roles & Permissions** (`/roles`, ADMIN) — static reference matrix for
  the fixed ADMIN/EDITOR/VIEWER roles; assignment happens on Users.
- **Audit Logs** (`/logs`, ADMIN) — searchable/paginated audit trail table
  and export action (typed stub — no audit log table yet).
- **Settings** (`/settings`, ADMIN) — General/Provider/Import/Player/Search
  forms, validated with Zod (typed stub — no Settings API yet).
- **Search** (`/search`) — global content search (real, movies/shows);
  also reachable from the topbar search box.

Role gating matches how the backend actually enforces access: every
`/admin/*` route requires ADMIN (see apps/backend's `AdminController`), so
every section above marked ADMIN is hidden from the nav and blocked by
`RoleGuard` for EDITOR/VIEWER. Catalog and Search have no such restriction.

## Architecture notes

- **Typed service layer, no mock data**: `src/services/*Service.ts` defines
  one module per backend area. Where Milestone 5 has a real endpoint, the
  service calls it directly. Where it doesn't (Import Jobs, Synchronization
  status, Settings, Audit Logs, and a few Provider/User actions), the
  service still defines the full typed request/response contract and calls
  the namespace a future endpoint would use — it 404s today, and the UI
  shows an explicit "not available yet" empty state instead of fabricated
  numbers. `ApiError.isNotImplemented` (true on a 404) is what drives that
  distinction in `ErrorState` and in every mutation's error handler.
- **`apiClient.ts`**: a small fetch wrapper that attaches the JWT, unwraps
  the `{success, data, meta}` / `{success, error}` envelope into a typed
  result or a thrown `ApiError`, and — on a 401 — attempts one silent
  `POST /auth/refresh` before retrying the original request once; if that
  also fails, it signals `AuthContext` to sign the user out.
- **`usePaginatedQuery`**: one hook shared by every list page (Movies,
  Shows, Users, Import Jobs, Audit Logs) wiring pagination/search/sort
  state to TanStack Query, so each page only supplies its columns and
  fetcher.
- **`DataTable`**: the one reusable table component (search box, optional
  filter slot, sortable headers, pagination, loading skeleton, error state,
  empty state) — every list page is a thin wrapper around it.
- **RBAC**: `src/lib/permissions.ts` is static reference data (roles are a
  closed backend enum, not a dynamic permissions API) — `hasPermission`
  for fine-grained action gating and `isAdmin` for whole-section gating via
  `RoleGuard`, matching how apps/backend actually enforces `/admin/*`.

### Dependency version notes

- **Next.js 15.x, not 16.x**: 16 had just been released; 15 is the
  established, broadly-documented Pages Router line.
- **MUI 7.x, not 9.x**: `@mui/material@9.2.0` (the version resolved as
  "latest" at the time) has a polymorphic-component typing regression under
  this repo's TypeScript version — `Typography`/`Stack` fail to type-check
  with `variant`/`fontWeight`/`direction`/etc. props at all
  (`No overload matches this call`, falling back to a bare HTML-element
  overload). Downgrading to the stable 7.3.11 line resolved every instance
  with no code changes. If a future upgrade to MUI 9+ is attempted, verify
  this regression is fixed upstream first.
- **TypeScript 5.9.3 for this package only** (not the workspace-wide
  5.7.2): needed for compatibility with current `@types/react`/Next.js
  tooling. Scoped to `apps/admin/package.json`'s own `devDependency`, so it
  doesn't affect any other package's pinned version.

## Testing

```bash
pnpm --filter @ctv-platform/admin test
```

Uses `node --test` (consistent with every other package in this monorepo,
not Jest, despite `specification/14-Testing.md.txt`'s stated preference —
an established precedent from Milestones 2–5), with `tsx` for on-the-fly
TS/JSX execution, `global-jsdom` for a DOM environment, and
`@testing-library/react` for component rendering. Because `tsx`/esbuild
needs the automatic JSX runtime (unlike Next's own compiler, which is
configured for `"jsx": "preserve"` in `tsconfig.json`), tests run against
a separate `tsconfig.test.json` (`"jsx": "react-jsx"`) via the
`TSX_TSCONFIG_PATH` environment variable.

- `tests/permissions.test.ts` — the RBAC permission matrix.
- `tests/apiClient.test.ts` — envelope unwrapping, `ApiError` mapping, and
  the 401-refresh-then-retry-once flow, against a mocked `fetch`.
- `tests/DataTable.test.tsx`, `tests/RoleGuard.test.tsx`,
  `tests/Login.test.tsx` — component tests via Testing Library. `RoleGuard`
  and `Login` are tested by wrapping them in `<AuthContext.Provider>`
  directly with a fake `login`/`user` value, rather than the real
  `AuthProvider` (which needs a Next.js router) — `AuthContext` is exported
  from `context/AuthContext.tsx` for exactly this purpose.

## Known scope boundaries

- No concrete provider (Cinemana/TMDB) exists — Providers/Synchronization
  correctly show an empty registry.
- Import Jobs, Synchronization status/queue metrics, Settings, Audit Logs,
  admin create/delete-user, reset-password, and provider enable/disable/
  reload all call real, typed, namespaced endpoints that the backend
  doesn't implement yet (see the "Typed service layer" note above) — this
  mirrors gaps already documented in the Milestone 4 and 5 AI Memory
  updates (no `Person`/`Company`/`Genre`/`Collection` aggregate, no
  `Setting`/audit-log wiring, no persisted job history).
- Genres, Collections, People, and a generic "System" resources page
  (CPU/memory/disk) from the wider spec are out of scope for this
  milestone — the user's Milestone 6 instructions enumerated a narrower
  section list than `specification/11-Admin-Dashboard.md.txt`'s full set,
  and that narrower list is what was built.
- True push-based real-time updates (spec's "Real-time Updates") would
  need a WebSocket/SSE backend endpoint that doesn't exist; Provider
  Health and backend Health instead poll every 30 seconds via TanStack
  Query's `refetchInterval`.
