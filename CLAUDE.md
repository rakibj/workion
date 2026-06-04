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
| Query builder | Kysely (typed SQL — NOT an ORM) |
| Migrations | Kysely migrations (`apps/server/src/database/migrations/`) |
| Caching | Redis + `@nestjs/cache-manager` |
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

**Always pass the URL string directly to ioredis. Never reconstruct from `parseRedisUrl()` parts.**

`parseRedisUrl()` discards the `rediss://` TLS signal — reconstructed parts create a plain TCP connection that Upstash resets immediately.

```ts
// ❌ — loses TLS
const c = parseRedisUrl(url);
new Redis({ host: c.host, port: c.port, password: c.password });

// ✅ — ioredis detects rediss:// and enables TLS
new Redis(url);
new Redis(url, { maxRetriesPerRequest: null }); // BullMQ
config: { url }                                  // @nestjs-labs/nestjs-ioredis
```

`parseRedisUrl()` is still safe for reading metadata (e.g. `family`) as long as the URL is also passed as the actual connection string.

---

## Infrastructure (Dev)

```bash
docker compose up -d            # start DB + Redis
pnpm run dev                    # client + server with hot reload
pnpm run server:dev             # NestJS only
pnpm run client:dev             # Vite only

pnpm --filter server run migration:create   # scaffold migration
pnpm --filter server run migration:latest   # run pending
pnpm --filter server run migration:down     # rollback one

pnpm --filter server run test               # Jest (backend)
pnpm --filter server run test:cov           # with coverage
pnpm --filter client run test               # Vitest (frontend)
```

**Docker Compose files:**
| File | Purpose |
|---|---|
| `docker-compose.yml` | Dev default — PostgreSQL + Redis only. App runs locally. |
| `docker-compose.prod.yml` | Full production stack. Never use for local dev. |

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

| Service | Where | Notes |
|---|---|---|
| App (NestJS) | Contabo VPS — Docker | `http://157.173.120.4` |
| Redis | Contabo VPS — Docker | `REDIS_URL=redis://redis:6379` |
| Postgres | Neon (eu-central-1, pooler endpoint) | `&pgbouncer=true` required |
| File storage | Cloudflare R2 | bucket: `workion`, uses `AWS_S3_*` prefix |

**No domain in use.** Direct bare IP only. Do not suggest domain-based solutions until a domain is set up.

**Upstash abandoned** — BullMQ exhausted the free tier in ~10 days. Now using local Redis.

---

## Deploying to VPS

`deploy.sh` at repo root: git pull → docker build → docker up → migrations.

```bash
# Standard deploy
git push origin main
ssh root@157.173.120.4
cd /home/apps/workion && ./deploy.sh

./deploy.sh --no-cache      # after package.json / pnpm-lock.yaml changes
./deploy.sh --skip-migrate  # skip migrations

# Migrations only
docker compose -f docker-compose.prod.yml exec app pnpm --filter server migration:latest

# Env var change (no rebuild)
nano .env
docker compose -f docker-compose.prod.yml restart app

# Logs
docker compose -f docker-compose.prod.yml logs -f app

# Rollback
git checkout <commit-hash>
docker compose -f docker-compose.prod.yml build --no-cache && up -d
```

---

## Permission System (Core — Do Not Break)

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

`space_members`: member is either a **user** OR a **group** (DB check constraint).

**Page access:** No restriction → space role determines read/write. Restricted → only users/groups in `page_permissions` can access (space membership still required as outer gate).

**CASL** (`apps/server/src/core/casl/`): `workspace-ability.factory.ts` + `space-ability.factory.ts`. Never bypass — add new abilities through the factory pattern.

---

## Database Schema (Key Tables)

Generated types: `apps/server/src/database/types/db.d.ts` (auto-generated, do not hand-edit).

| Table | Purpose |
|---|---|
| `workspaces` | Top-level tenant |
| `users` | Workspace-scoped users |
| `groups` / `group_users` | Role grouping |
| `spaces` | Document spaces |
| `space_members` | User or group → space role |
| `pages` | Hierarchical docs (parent_id self-ref) |
| `page_permissions` | Per-page user/group overrides |
| `page_access` | Restriction flag per page |
| `page_history` | Full revision history |
| `comments` | Threaded page comments |
| `attachments` | File attachments |
| `workspace_invitations` | Invite flow |
| `shares` | Public share links |
| `labels` / `watchers` / `favorites` | Tagging, subscriptions, starred |
| `kanban_tasks` / `kanban_columns` | Kanban board data |
| `templates` | Page templates |
| `workspace_ai_config` | OpenRouter API key (encrypted) |

New tables go in new migration files. Never alter existing migrations.

---

## Server Module Map

### Work areas

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
| `core/kanban/` | Kanban board |
| `core/ai-chat/` | AI chat — OpenRouter BYOK streaming |
| `core/notification/` | In-app notifications |
| `core/template/` | Page templates |
| `database/migrations/` | Schema migrations |
| `database/repos/` | Data access layer |

### Black boxes (do not modify unless you must)

| Path | Why hands-off |
|---|---|
| `collaboration/` | Hocuspocus engine — additive touches only |
| `apps/editor-ext/` | TipTap extensions |
| `apps/ee/` | Enterprise Edition — conditionally loaded |
| `integrations/storage/` | Use `StorageService`, don't re-implement |
| `integrations/mail/` | Use `MailModule`, don't touch internals |
| `integrations/queue/` | Add new jobs/queues, don't change infra |
| `integrations/export/` | PDF/Markdown export |
| `integrations/import/` | Confluence/DOCX import |

---

## Client Module Map

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
| `features/page/board/` | tldraw whiteboard |
| `features/page/kanban/` | Kanban board |
| `features/ai-chat/` | AI chat panel + key settings |
| `features/notification/` | Notification bell + popover |
| `apps/client/src/ee/template/` | Page templates UI |

### Black boxes

| Path | Why hands-off |
|---|---|
| `features/editor/` | TipTap integration |
| `features/transclusion/` | Page embedding |
| `features/websocket/` | Real-time sync |

---

## Personal-Use Restrictions

New workspace creation is gated by `ALLOW_SIGNUP` env var (default `false`):
- **Backend**: `SetupGuard` allows if workspace count is zero (first-time) OR `ALLOW_SIGNUP=true`; 403 otherwise.
- **Frontend**: `setup-workspace.tsx` fetches `allowSignup` via `GET /api/auth/setup-config`; redirects to `/login` if `false`.
- Set `ALLOW_SIGNUP=true` in VPS `.env` to re-enable. Invitations and login always work.

---

## Implemented Custom Features

### AI Chat (BYOK via OpenRouter)
OpenRouter key stored per workspace in `workspace_ai_config` (encrypted). Backend: `core/ai-chat/` — streaming chat, page content injection, auto-title. Frontend: slide-over panel with thread list + model selector; key UI in workspace settings. All AI routes through OpenRouter only — no direct Anthropic/OpenAI calls.

### Whiteboard Page (tldraw)
`board` page type → full-screen tldraw canvas. Uses Hocuspocus/Yjs with `board.{pageId}` room prefix (additive-only touch on `collaboration/`). `HocuspocusProviderWebsocket` is a **module-level singleton** in `board-editor.tsx` — do not destroy it on unmount (expensive TCP reconnect). Only the per-board `HocuspocusProvider` is created/destroyed per page.

### Kanban Board Page
`kanban` page type. Backend: `core/kanban/`, tables `kanban_tasks`/`kanban_columns`. Frontend: `features/kanban/`, Atlaskit pragmatic DnD; assignees, due dates, priority. Realtime: WS events `kanbanCardMoved`/`kanbanColumnMoved` on `page-${pageId}` room; filtered by `userId` to skip self. Milestone badge turns red (overdue) / amber (today).

### In-App Notifications
Bell icon with unread badge. Backend: `core/notification/` — BullMQ processor + WS delivery to `user-${userId}` channel. `watchers` table: `watcher.service.ts` handles watch/unwatch for pages and spaces.

### Page Templates
`templates` table (workspace-scoped). `core/template/` — `TemplateController` with 6 POST endpoints (`/templates`, `/templates/info`, `/templates/create`, `/templates/update`, `/templates/delete`, `/templates/use`). UI: `apps/client/src/ee/template/`.

### HTML Artifact Block
`htmlArtifact` TipTap node via `/html` slash command. `features/editor/extensions/html-artifact.ts`. Sandboxed `<iframe sandbox="allow-scripts">` (no `allow-same-origin`). Persists `html` + `height` attrs in Yjs — no DB table. Auto-sizes via `postMessage(scrollHeight)`. Resizable drag handle; double-click resets.

### In-Place AI Text Improvement
`POST /ai/generate/stream` (SSE) and `POST /ai/generate` in `core/ai-chat/controllers/ai-generate.controller.ts`. DTO: `{ action, content, prompt? }`. No message persistence — pure one-shot transformation.

### Block Handle Context Menu
`drag-handle.ts` dispatches `blockHandleClick` event on handle click. Component: `features/editor/components/block-menu/block-menu.tsx` — Turn into, Text/Background color, Duplicate, Copy link (headings), Ask AI, Delete. Wired via `addEventListener('blockHandleClick')` in `page-editor.tsx`.

### Comment Resolve + Realtime Toast
`POST /comments/resolve` → `CommentService.resolve()` — sets `resolvedAt`/`resolvedById`, emits `commentResolved` WS event, queues notification. `use-query-subscription.ts` shows toast on `commentCreated` from other users (filtered via `queryClient.getQueryData(["currentUser"])`).

### Logo
SVG at `apps/client/src/assets/logo-workion.svg`, imported in `auth-layout.tsx` as a JS module (Vite content-hashes it). To update: replace the SVG and redeploy.

---

## Adding a New Feature — Checklist

```
[ ] 1. Write spec (problem, data model delta, API endpoints, UI flows, edge cases)
[ ] 2. Get spec approved before touching code
[ ] 3. Write migration (if schema changes) — run locally, verify
[ ] 4. Write unit tests — they must fail first
[ ] 5. Implement service/repo layer
[ ] 6. Tests pass
[ ] 7. Implement controller + DTOs
[ ] 8. Implement frontend (queries → components)
[ ] 9. Manual smoke test
[ ] 10. Update CLAUDE.md if architecture changes
```

---

## Testing Conventions

**Backend (Jest, co-located `.spec.ts`):** Use `@nestjs/testing` with `jest.Mocked<RepoClass>` — never hit a real DB. Canonical pattern: `apps/server/src/core/page/services/backlink.service.spec.ts`.

```ts
const module = await Test.createTestingModule({
  providers: [ServiceUnderTest, { provide: SomeDep, useValue: mockValue }],
}).compile();
```

**Frontend (Vitest):** Test hooks and utility functions; avoid snapshot tests.

**What to test:** Happy path + two failure/edge cases. Permission boundaries must throw `ForbiddenException`.

---

## Key File Locations

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

### DOMAIN: Apply Domain to VPS

**Priority: P1 — Infrastructure change, enables HTTPS | Status: TODO**

Point a domain at `157.173.120.4`, terminate TLS with Caddy (Let's Encrypt), proxy to app on port 3000.

1. **DNS:** A record → `157.173.120.4`.
2. **Caddy service** in `docker-compose.prod.yml`:
   ```yaml
   caddy:
     image: caddy:2-alpine
     restart: unless-stopped
     ports: ["80:80", "443:443"]
     volumes:
       - ./Caddyfile:/etc/caddy/Caddyfile
       - caddy_data:/data
       - caddy_config:/config
   ```
3. **Caddyfile:** `yourdomain.com { reverse_proxy app:3000 }`
4. Remove port 3000 from public exposure on `app` service.
5. Update VPS `.env`: `APP_URL=https://yourdomain.com`. Check `COLLAB_URL` for `wss://` too.
6. `./deploy.sh --no-cache`

**Files:** `docker-compose.prod.yml`, `Caddyfile` (new), `.env` on VPS.
