# CLAUDE.md — Docmost Client Management Fork

> **Living document.** Update this file at the start of each new feature. Keep it accurate as the project evolves — stale guidance is worse than none.

---

## Project Goal

Fork of [docmost](https://github.com/docmost/docmost) repurposed as a **client management platform**. Docmost provides the document/wiki backbone; the goal is to layer client-centric features on top (client spaces, per-client access control, project tracking, client portals, etc.) while treating the core document engine as a black box.

---

## Development Methodology

**Spec → Approve → Implement (step by step, not in chunks)**

1. **Write a spec** for the feature: what it does, data model changes, API contract, UI behaviour, edge cases.
2. **Get approval** before writing a single line of implementation.
3. **Implement incrementally**: one slice at a time (migration → service → controller → frontend).
4. **Write unit tests first** (TDD): red → green → refactor.
5. **Update this file** if the feature changes architecture or adds new black-box zones.

Never implement more than one approved feature at once. Never skip the spec step.

---

## Monorepo Layout

```
docmost/
├── apps/
│   ├── server/          # NestJS backend  ← primary work area
│   ├── client/          # React + Vite frontend  ← primary work area
│   ├── editor-ext/      # TipTap extensions  ← BLACK BOX
│   └── ee/              # Enterprise Edition modules  ← BLACK BOX (optional plugin)
├── packages/            # Shared packages (db types, editor config)
├── docker-compose.yml
└── pnpm-workspace.yaml
```

**Package manager**: pnpm 10 with NX for task orchestration.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | NestJS (modular, DI-based) |
| Database | PostgreSQL 18 |
| Query builder | Kysely (typed SQL — NOT an ORM; no magic, raw-ish) |
| Migrations | Kysely migrations (`apps/server/src/database/migrations/`) |
| Caching | Redis + `@nestjs/cache-manager` (5s default TTL) |
| Job queue | BullMQ (Redis-backed) |
| Real-time collab | Hocuspocus + Yjs ← **BLACK BOX** |
| Frontend framework | React 18 |
| Build tool | Vite |
| UI library | Mantine |
| Editor | TipTap ← **BLACK BOX** |
| Whiteboard | tldraw (board page type, real-time via Yjs) |
| Auth | JWT sessions, CASL for RBAC |
| Storage | S3-compatible or local (`StorageService`) |
| Email | Configurable via `MailModule` |

---

## Redis Connection Rule

**Always pass the URL string directly to ioredis. Never reconstruct a connection from `parseRedisUrl()` parts.**

`parseRedisUrl()` decomposes the URL into host/port/password but discards the `rediss://` TLS signal. Passing those parts to an ioredis constructor creates a plain TCP connection that Upstash (and any TLS-only Redis) immediately resets.

```ts
// ❌ — loses TLS
const c = parseRedisUrl(url);
new Redis({ host: c.host, port: c.port, password: c.password });

// ✅ — ioredis detects rediss:// and enables TLS
new Redis(url);
new Redis(url, { maxRetriesPerRequest: null }); // BullMQ
config: { url }                                  // @nestjs-labs/nestjs-ioredis
```

`parseRedisUrl()` is still safe for reading metadata (e.g. `family` for IPv4/IPv6 forcing) as long as the URL is also passed as the actual connection string.

---

## Infrastructure (Dev)

```bash
# 1. Start DB + Redis (run once, keep running in background)
docker compose up -d

# 2. Start the app with hot reload
pnpm run dev            # client + server concurrently

# Individual
pnpm run server:dev     # NestJS with watch
pnpm run client:dev     # Vite dev server

# Migrations
pnpm --filter server run migration:create   # scaffold new migration
pnpm --filter server run migration:latest   # run all pending migrations
pnpm --filter server run migration:down     # rollback one

# Tests
pnpm --filter server run test               # Jest (backend)
pnpm --filter server run test:cov           # with coverage
pnpm --filter client run test               # Vitest (frontend)
```

**Docker Compose files — do not confuse them:**
| File | Purpose |
|---|---|
| `docker-compose.yml` | **Dev default.** Starts PostgreSQL + Redis only. App runs locally via `pnpm run dev`. |
| `docker-compose.prod.yml` | Full production stack with a built image. Requires real `APP_SECRET`. Never use for local dev. |

**Required env vars** (`.env` at repo root):
```
APP_URL=http://localhost:3000
APP_SECRET=<long-random-string>
DATABASE_URL=postgresql://docmost:docmost_dev_pass@localhost:5432/docmost
REDIS_URL=redis://localhost:6379
```

---

## Cloud Deployment Status

> Credentials in `Cloud Implementation.md` (never commit).

### Current infrastructure

| Service | Where | Status |
|---|---|---|
| App (NestJS) | Contabo VPS — Docker | Live at `http://157.173.120.4` |
| Redis | Contabo VPS — Docker (local) | Running alongside app, `REDIS_URL=redis://redis:6379` |
| Postgres | Neon (managed, eu-central-1 Frankfurt) | Connected |
| File storage | Cloudflare R2 | Connected (bucket: `workion`) |

**No domain in use.** App is accessed directly via bare IP `http://157.173.120.4`. No DNS, no Caddy, no Cloudflare proxy. Do not reference `projects.gameloops.io` or suggest domain-based solutions until a domain is actually set up.

**Upstash abandoned** — BullMQ's idle polling exhausted the 500K/month free tier in ~10 days. Switched to local Redis (free, no limits). Upstash credentials kept in `Cloud Implementation.md` for reference only.

**R2 env var fix** — app requires `AWS_S3_*` prefix (not `S3_*`). Already fixed on server.

---

## Deploying Local Changes to Cloud (VPS)

The VPS runs the app via `docker-compose.prod.yml`. `deploy.sh` (repo root, already pushed) handles the full cycle.

### Every deploy

```bash
# 1. Local — commit and push
git add <files>
git commit -m "your message"
git push origin main

# 2. SSH into the VPS and run
ssh root@157.173.120.4
cd /home/apps/workion
./deploy.sh
```

The script does: git pull → docker build → docker up → migrations.

```bash
./deploy.sh --no-cache      # full image rebuild — use after changing package.json / pnpm-lock.yaml
./deploy.sh --skip-migrate  # skip migrations
```

**First-time VPS setup** (once only — after cloning the repo):
```bash
chmod +x deploy.sh
```

### Migrations only (no code changes)

```bash
ssh root@157.173.120.4
cd /home/apps/workion
docker compose -f docker-compose.prod.yml exec app pnpm --filter server migration:latest
```

### Env var changes only (no rebuild needed)

```bash
ssh root@157.173.120.4
cd /home/apps/workion
# Edit .env on the server
nano .env

# Restart the app container to pick up new env
docker compose -f docker-compose.prod.yml restart app
```

### Check app logs

```bash
# Follow live logs
docker compose -f docker-compose.prod.yml logs -f app

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 app
```

### Rollback to previous commit

```bash
ssh root@157.173.120.4
cd /home/apps/workion
git log --oneline -10          # find the target commit hash
git checkout <commit-hash>
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
# Note: migrations are forward-only; rollback via migration:down if schema changed
```

---

## Permission System (Core — Do Not Break)

This is the most important existing system. Understand it before touching anything access-related.

### Three-tier hierarchy

```
Workspace
  └── Space (visibility: open | private)
        └── Page (access: normal | restricted)
```

### Role enums (`apps/server/src/common/helpers/types/permission.ts`)

```ts
UserRole:   owner | admin | member          // workspace level
SpaceRole:  admin | writer | reader         // space membership level
PagePermissionRole: writer | reader         // page-level override
```

### Space membership

`space_members` table: a member is either a **user** OR a **group** (enforced by DB check constraint). Groups allow bulk role assignment.

### Page access logic (`page-access.service.ts`)

- If page has **no restriction**: space-level role determines read/write.
- If page is **restricted** (`PageAccessLevel.RESTRICTED`): only users/groups in `page_permissions` can access. Space role still required as minimum barrier.
- Both checks always apply — space membership is the outer gate.

### CASL abilities (`apps/server/src/core/casl/`)

- `workspace-ability.factory.ts` — workspace-scoped actions
- `space-ability.factory.ts` — space-scoped actions (Settings, Member, Page, Share)
- Used via `@UseGuards(JwtAuthGuard)` + manual `ability.cannot(...)` calls in controllers

**Rule**: never bypass CASL checks. Add new abilities through the factory pattern.

---

## Database Schema (Key Tables)

Generated types live in `apps/server/src/database/types/db.d.ts` (auto-generated, do not hand-edit).

| Table | Purpose |
|---|---|
| `workspaces` | Top-level tenant |
| `users` | Workspace-scoped users (email unique per workspace) |
| `groups` / `group_users` | Role grouping |
| `spaces` | Document spaces within a workspace |
| `space_members` | User or group → space role mapping |
| `pages` | Hierarchical docs (parent_id self-ref) |
| `page_permissions` | Per-page user/group overrides |
| `page_access` | Restriction flag per page |
| `page_history` | Full revision history |
| `comments` | Threaded page comments |
| `attachments` | File attachments |
| `workspace_invitations` | Invite flow |
| `shares` | Public share links |
| `labels` | Page tagging |
| `watchers` | Page subscription |
| `favorites` | Starred pages |

**New tables for client management features** go in new migration files. Never alter existing migrations.

---

## Server Module Map (Black Box vs. Work Area)

### Work areas (safe to extend)

| Path | What it is |
|---|---|
| `core/auth/` | Login, registration, session |
| `core/workspace/` | Workspace CRUD, user management |
| `core/space/` | Space CRUD, member management |
| `core/page/` | Page CRUD, tree, history |
| `core/page/page-access/` | Permission enforcement |
| `core/casl/` | CASL ability factories |
| `core/user/` | User profile |
| `core/group/` | Group management |
| `core/comment/` | Comments |
| `core/label/` | Labels |
| `core/kanban/` | Kanban board (project tracker pages) |
| `core/ai-chat/` | AI chat — OpenRouter BYOK streaming, key management |
| `database/migrations/` | Schema migrations |
| `database/repos/` | Data access layer |

### Black boxes (do not modify unless you must)

| Path | Why hands-off |
|---|---|
| `collaboration/` | Hocuspocus real-time engine. Treat as black box — only additive touches allowed (new guards/conditions inside existing extensions, never restructuring). |
| `apps/editor-ext/` | TipTap editor extensions |
| `apps/ee/` | Enterprise Edition — conditionally loaded, treat as plugin |
| `integrations/storage/` | S3/local abstraction — use `StorageService`, don't re-implement |
| `integrations/mail/` | Email sending — use `MailModule`, don't touch internals |
| `integrations/queue/` | BullMQ setup — add new jobs/queues, don't change infra |
| `integrations/export/` | PDF/Markdown export |
| `integrations/import/` | Confluence/DOCX import |

If a black-box module needs to change, write a spec for it first and flag explicitly in the PR.

---

## Client (Frontend) Module Map

### Work areas

| Path | What it is |
|---|---|
| `features/auth/` | Login/signup UI |
| `features/workspace/` | Workspace settings |
| `features/space/` | Space listing, settings, members |
| `features/page/` | Page tree, page view |
| `features/user/` | User profile |
| `features/group/` | Group management UI |
| `features/home/` | Dashboard |
| `features/page/board/` | tldraw whiteboard page type |
| `features/page/kanban/` | Kanban board page type |
| `features/ai-chat/` | AI chat panel + OpenRouter key settings |

### Black boxes

| Path | Why hands-off |
|---|---|
| `features/editor/` | TipTap integration — rich editor, leave alone |
| `features/transclusion/` | Page embedding feature |
| `features/websocket/` | Real-time sync |

---

## Personal-Use Restrictions

### New Workspace Signup — Disabled
New workspace creation via `/setup/register` is intentionally off for personal use.

**How it works (no code change needed):**
- **Backend**: `SetupGuard` (`core/auth/guards/setup.guard.ts`) throws 403 if any workspace already exists.
- **Frontend**: `pages/auth/setup-workspace.tsx` redirects to `/login` if workspace data loads — the form never renders.

Invitations, login, and all other auth flows remain fully functional.

**To re-enable:** Delete the existing workspace from the DB, or modify `SetupGuard` to always return `true`. Write a spec first if re-enabling for multi-tenant use.

---

## Implemented Custom Features

### AI Chat (BYOK via OpenRouter)
- Users store their own OpenRouter API key per workspace (encrypted at rest in `workspace_ai_config` table).
- Backend: `core/ai-chat/` — streaming chat via OpenRouter, context injection from current page content, auto-title generation for threads.
- Frontend: slide-over panel with thread list, message history, and model selector; key management UI in workspace settings.
- Do not add Anthropic/OpenAI direct calls — all AI traffic routes through OpenRouter.

### Whiteboard Page (tldraw + live cursors)
- A `board` page type renders a full-screen tldraw canvas instead of the TipTap editor.
- Real-time multi-user cursors use the existing Hocuspocus/Yjs infrastructure with a `board.{pageId}` room prefix — additive-only touch on `collaboration/`.
- Board state is persisted as a Yjs doc (same store as rich-text pages); no separate DB table needed.
- Entry point: `features/page/board/` (client). Do not restructure the collab layer.

### Kanban Board Page
- A `kanban` page type renders a drag-and-drop board (columns = status, cards = tasks) inside a page.
- Backend: `core/kanban/` — task/column CRUD with position ordering; tasks stored in `kanban_tasks` and `kanban_columns` tables.
- Frontend: `features/kanban/` — uses Atlaskit pragmatic drag-and-drop; inline card editing, assignees, due dates, priority (urgent/high/medium/low with color coding).
- Milestone overdue indicator: milestone badge turns red (overdue) or amber (today) with a warning icon; a colored date row appears below card badges; card modal also shows colored date.
- Kanban pages live in the normal page tree and respect the same space/page permission model.

### In-App Notifications
- Bell icon in app header with unread badge; popover lists notifications filtered by type (all / unread / mentions / updates).
- Backend: `core/notification/` — service creates notifications, BullMQ processor handles queued jobs, WebSocket delivers to `user-${userId}` channel in real time.
- Watchers (`watchers` table) are notified on comment creation; `watcher.service.ts` handles watch/unwatch for pages and spaces.

### Page Templates
- Workspace-scoped templates with title, description, content, icon, and full-text search; stored in `templates` table.
- Backend: `core/template/` — `TemplateService` + `TemplateController` with 6 POST endpoints (`/templates`, `/templates/info`, `/templates/create`, `/templates/update`, `/templates/delete`, `/templates/use`). `use` creates a real page via `PageService.create()`.
- Client UI fully implemented under `apps/client/src/ee/template/` (picker modal, create modal, list page, editor).
- Permissions: space writer/admin for create/update/delete; any space member for list/read/use.

### HTML Artifact Block
- A custom TipTap `Node` (`htmlArtifact`) inserted via the `/html` slash command. Stores raw HTML and a persisted height in node attributes (`html`, `height`) — no new table, no new page type, no new API endpoint. Yjs syncs both attrs across collaborators for free.
- Extension: `features/editor/extensions/html-artifact.ts` — registered in `extensions.ts` alongside all other extensions.
- NodeView: `features/editor/components/html-artifact/html-artifact-view.tsx` — Edit / Split / Preview toggle (desktop); Preview-only with a full-screen modal editor on mobile (< 768 px). Read-only pages are locked to Preview mode.
- Auto-sizing: a tiny script injected at the end of `srcdoc` posts `scrollHeight` via `postMessage` to the parent. A `height:auto!important` reset style (also appended after user HTML) prevents `height:100vh` / `min-height:100vh` on `html`/`body` from inflating the reported height.
- Resizable: drag handle at the bottom sets `node.attrs.height` (persisted); double-click resets to auto-fit.
- Security: `<iframe sandbox="allow-scripts">` without `allow-same-origin` — scripts run in a null origin, cannot access parent cookies or DOM.
- Export: `renderHTML` emits `<pre data-type="html-artifact"><code class="language-html">…</code></pre>` as a Markdown/PDF fallback; no changes to the black-box export module.

### In-Place AI Text Improvement
- Backend for the editor's inline AI transformation feature. Frontend was pre-built; this adds the missing server endpoints.
- Routes: `POST /ai/generate/stream` (SSE) and `POST /ai/generate` (non-streaming) — both in `core/ai-chat/controllers/ai-generate.controller.ts`.
- Maps `AiAction` enum values to system prompts; delegates to `AiStreamService.streamChat()`. No message persistence — pure one-shot transformation.
- DTO: `core/ai-chat/dto/ai-generate.dto.ts` with `{ action, content, prompt? }`.

### Block Handle Context Menu
- Clicking the drag handle (⠿) opens a context menu with block-level actions. Drag is unaffected.
- `drag-handle.ts`: tracks `currentNodePos`/`currentNodeType` on `mousemove`; dispatches `blockHandleClick` custom event on click.
- Component: `features/editor/components/block-menu/block-menu.tsx` — uses Mantine `Menu` with submenus for Turn into, Text color, Background color; plus Duplicate, Copy link (headings), Ask AI, Delete.
- Wired in `page-editor.tsx` via `addEventListener('blockHandleClick')` on the `menuContainerRef`.
- Context-sensitive: Turn into and Color sections hidden for tables/images/code blocks; Copy link only for headings with an `id` attr.

### Comment Resolve + Realtime Toast
- **Comment resolve** was broken — `POST /comments/resolve` endpoint was missing from the backend despite the DB schema, frontend mutation, and notification infrastructure all existing.
- Added: `dto/resolve-comment.dto.ts`, `resolve()` method in `CommentService`, `POST /comments/resolve` in `CommentController`. Sets `resolvedAt`/`resolvedById` in DB, emits `commentResolved` WS event, queues `COMMENT_RESOLVED_NOTIFICATION` job (only when resolving someone else's comment).
- **Realtime toast**: `use-query-subscription.ts` now shows a blue Mantine toast ("X left a comment") on `commentCreated` WS events from other users. Uses `queryClient.getQueryData(["currentUser"])` to filter out self-comments — no extra hook calls.

---

## Adding a New Feature — Checklist

```
[ ] 1. Write spec (problem, data model delta, API endpoints, UI flows, edge cases)
[ ] 2. Get spec approved in conversation before touching code
[ ] 3. Write migration (if schema changes) — run locally, verify
[ ] 4. Write unit tests (Jest/Vitest) — they must fail first
[ ] 5. Implement service/repo layer
[ ] 6. Tests pass
[ ] 7. Implement controller + DTOs
[ ] 8. Implement frontend (queries → components)
[ ] 9. Manual smoke test
[ ] 10. Update CLAUDE.md if architecture changes
```

---

## Testing Conventions

### Backend (Jest, co-located `.spec.ts` files)

- Use `@nestjs/testing` `Test.createTestingModule` with mocked repos.
- Mock all repos with `jest.Mocked<RepoClass>` — never hit a real DB in unit tests.
- See `apps/server/src/core/page/services/backlink.service.spec.ts` for the canonical pattern.
- Test files live next to the file they test: `foo.service.ts` → `foo.service.spec.ts`.

```ts
// Pattern:
const module = await Test.createTestingModule({
  providers: [
    ServiceUnderTest,
    { provide: SomeDependency, useValue: mockValue },
  ],
}).compile();
```

### Frontend (Vitest)

- Run with `pnpm --filter client run test`.
- Test hooks and utility functions; avoid snapshot tests.

### What to test

- Happy path + at least two failure/edge cases per unit.
- Permission boundaries: ensure forbidden paths throw `ForbiddenException`.
- New DB queries: test with mocked repo, not real DB.

---

## Key File Locations (Quick Reference)

```
Permission types:     apps/server/src/common/helpers/types/permission.ts
CASL factories:       apps/server/src/core/casl/abilities/
Page access service:  apps/server/src/core/page/page-access/page-access.service.ts
Space service:        apps/server/src/core/space/services/space.service.ts
DB types (generated): apps/server/src/database/types/db.d.ts
Migrations:           apps/server/src/database/migrations/
Repos:                apps/server/src/database/repos/
Feature flags:        apps/server/src/common/features.ts
App env config:       apps/server/src/integrations/environment/environment.service.ts
Cache helper:         apps/server/src/common/helpers/with-cache.ts
Cache keys:           apps/server/src/common/helpers/cache-keys.ts
```

---

## Pending Specs

Specs waiting for approval before implementation. Do not implement any of these until explicitly approved in conversation.

> **Performance spec audit (2026-06-04):** Full performance audit completed. Root causes of slowness: (1) no HTTP compression — all JSON sent raw, (2) page and tree reads still hit Neon on every navigation despite partial cache rollout, (3) share reads uncached, (4) Neon direct connection (not pooler) adds per-query overhead, (5) notification query always refetches. Specs below are ordered by priority. P0 and P1 are safe to ship together in one pass.

---

### PERF-1: Neon Connection Pooler

**Priority: P0 — 2 min env var change, zero code, biggest latency gain per query**
**Status: DONE (2026-06-04)**

Switched `DATABASE_URL` on the VPS from the direct Neon endpoint to the PgBouncer pooler endpoint (`ep-super-fire-a2rltgof-pooler.eu-central-1.aws.neon.tech`). Added `&pgbouncer=true` to disable prepared statements (required for PgBouncer transaction pooling mode). No code change, no rebuild — just a restart. Eliminates 50–100ms cold-connection overhead per query burst.

---

### PERF-2: HTTP Response Compression

**Priority: P0 — 15 min, biggest bandwidth win**
**Status: DONE (2026-06-04)**

Added `@fastify/compress@8.3.1` to `apps/server/package.json`. Registered with `{ global: true }` in `apps/server/src/main.ts` before all other plugin registrations. SSE routes (`text/event-stream`) are excluded automatically by the plugin — not in the default compressible MIME type list, so AI streaming is safe. 60–80% response size reduction for all JSON payloads.

---

### PERF-3: Page Base Metadata Caching

**Priority: P1 — ~1hr, reduces redundant Neon hits for page validation calls**
**Status: DONE (2026-06-04)**

Added `PAGE` cache key (`entity:page:{pageId}`, 60s TTL) to `cache-keys.ts`. Wrapped `PageRepo.findById()` base case (no opts — the metadata-only call used as "page exists?" checks throughout the controller) with `withCache()`, following the exact user/workspace repo pattern. Added `invalidatePageCache()` and wired it into `updatePages`, `removePage`, `deletePage`, and `restorePage`.

**What is NOT cached:** `findById` with any opts (includeContent, includeYdoc, etc.) — page content changes constantly via Yjs collaboration and must never be cached. Sidebar tree (`getSidebarPages`) is user-permission-dependent and skipped.

**Files touched**
```
apps/server/src/common/helpers/cache-keys.ts
apps/server/src/database/repos/page/page.repo.ts
```

---

### PERF-4: Share Entity Caching

**Priority: P1 — 30 min, eliminates DB hit on every public share page load**
**Status: DONE (2026-06-04)**

**Problem**

Every public share page open (`/share/:shareId/p/:pageSlug`) calls `ShareRepo.findByKey()` to validate the share exists and is active. Shares almost never change after creation. These reads currently go straight to Neon.

**What to cache**

| Cache key | Source method | TTL | Invalidate when |
|---|---|---|---|
| `entity:share:{shareKey}` | `ShareRepo.findByKey()` | 300s | Share updated (password, expiry, enabled toggle) or deleted |

**Implementation plan**

1. Add `SHARE` key and `SHARE_CACHE_TTL_MS = 300_000` to `cache-keys.ts`.
2. Wrap `ShareRepo.findByKey()` with `withCache()`.
3. In `ShareRepo.update()` and `ShareRepo.delete()`: invalidate `entity:share:{shareKey}`.

**UX risk:** Low. If a share is disabled/deleted, a cached response persists for up to 5 minutes. Acceptable for personal use. If tighter invalidation is needed, reduce TTL to 60s — still eliminates the majority of Neon hits.

**Files touched**
```
apps/server/src/common/helpers/cache-keys.ts
apps/server/src/database/repos/share/share.repo.ts
```

---

### PERF-5: Notification Query staleTime

**Priority: P2 — 2 min frontend change, stops unnecessary refetches**
**Status: DONE (2026-06-04)**

**Problem**

`useNotificationsQuery` is configured with `staleTime: 0` and `gcTime: 0`. Every time the notification popover mounts (every time the bell icon is clicked), it fires a fresh request to the server. New notifications already arrive in real time via WebSocket — the initial-load fetch is the only one that needs to be fresh.

**Fix**

In the notification query file, change:
```ts
// Before
staleTime: 0,
gcTime: 0,

// After
staleTime: 30_000,   // 30s — WebSocket handles real-time delivery
gcTime: 60_000,      // keep in memory 1 min after popover closes
```

**UX risk:** None. The WebSocket `notification` event already pushes new notifications into the query cache via `queryClient.invalidateQueries`. The staleTime only affects re-opens of the popover within 30 seconds — they show cached data instead of refetching, which is fine since real-time delivery via WebSocket is active.

**Files touched**
```
apps/client/src/features/notification/  (notification query hook)
```

---

### PERF-6: QueryClient gcTime (memory cache for fast back-navigation)

**Priority: P2 — 5 min, improves back-navigation feel**
**Status: DONE (2026-06-04)**

**Problem**

`gcTime` is not set in the global `QueryClient` config, so it uses React Query's default of 5 minutes. Once a page is unmounted, its cached data is garbage-collected after 5 minutes. Navigating back to a recently visited page within 5 minutes uses cached data (fast), but after that it refetches. For a knowledge-base app where users browse many pages, extending this window meaningfully reduces refetches.

**Fix**

In `apps/client/src/main.tsx`:
```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,   // add: keep cache 30min after unmount
    },
  },
});
```

**UX risk:** None. `gcTime` only affects when unused cache entries are garbage-collected from memory. It does not affect whether data is considered stale or triggers refetches. Slightly higher memory usage (cached pages stay in RAM longer), but negligible for a personal-use app with few open tabs.

**Files touched**
```
apps/client/src/main.tsx
```
