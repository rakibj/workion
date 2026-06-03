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
- Frontend: `features/page/kanban/` — uses `@hello-pangea/dnd` for drag-and-drop; inline card editing, assignees, due dates, priority (urgent/high/medium/low with color coding).
- Kanban pages live in the normal page tree and respect the same space/page permission model.

### In-App Notifications
- Bell icon in app header with unread badge; popover lists notifications filtered by type (all / unread / mentions / updates).
- Backend: `core/notification/` — service creates notifications, BullMQ processor handles queued jobs, WebSocket delivers to `user-${userId}` channel in real time.
- Watchers (`watchers` table) are notified on comment creation; `watcher.service.ts` handles watch/unwatch for pages and spaces.

### Page Templates
- Workspace-scoped templates with title, description, content, icon, and full-text search; stored in `templates` table.
- Client UI fully implemented under `apps/client/src/ee/template/` (picker modal, create modal, list page, editor).
- Backend repo and migration exist; controller wired and `templateId` supported in page creation flow.

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

## Feature Specs

> Specs live here only while work is **in progress or not started**. Remove a spec once the feature is fully shipped — the code and git history are the permanent record.

---

### SPEC: Template Backend — Wire Up Controller

**Problem**
The template system has a complete client UI (`apps/client/src/ee/template/`), DB migration, and repo, but no NestJS controller. All API calls (`/templates/*`) return 404.

**Data model**
No changes — `templates` table already exists with `id`, `title`, `description`, `content`, `icon`, `space_id`, `workspace_id`, `creator_id`, tsvector search column.

**API endpoints to implement** (all under `apps/server/src/core/template/`)
```
POST   /templates              create template (body: title, description, content, icon, spaceId)
GET    /templates              list templates for workspace (query: spaceId?, search?)
GET    /templates/:templateId  get single template
PATCH  /templates/:templateId  update template
DELETE /templates/:templateId  delete template
POST   /templates/:templateId/use  apply template — returns the page content/title to paste in
```

**Page creation integration**
- Add optional `templateId?: string` to `CreatePageDto`.
- In `page.service.ts` `createPage()`: if `templateId` provided, fetch template and pre-fill `title` and `content` on the new page.

**Permissions**
- Create/update/delete: space `admin` or `writer` only.
- Read/use: any space member.
- Guard with existing `SpaceAbility` — no new CASL actions needed.

**Module**
- New `TemplateModule` in `apps/server/src/core/template/` with `TemplateController`, `TemplateService`.
- Import `TemplateRepo` (already exists at `apps/server/src/database/repos/template/template.repo.ts`).
- Register in `CoreModule`.

**Feature flag**
- The client gates templates behind `Feature.TEMPLATES` (`apps/server/src/common/features.ts`). Ensure the flag is enabled by default (non-EE).

**Edge cases**
- Template belongs to a different workspace → 403.
- `templateId` not found on page create → 404, page creation aborted.
- Duplicate title in same space → allow (no unique constraint).

---

### SPEC: Kanban — Overdue Indicator

**Problem**
Kanban cards have milestone due dates but nothing signals when a milestone is past due. Users cannot tell at a glance which cards are late.

**Data model**
No changes — `due_date` already exists on `kanban_milestones`.

**UI changes only** (frontend, `apps/client/src/features/page/kanban/`)
- In the card component where `formatDueDate()` renders the due date string:
  - If `due_date < today` (date comparison, ignore time): render the date in red with a warning icon.
  - If `due_date === today`: render in amber.
  - Otherwise: current default styling.
- Same indicator in the card edit modal next to the milestone field.
- No backend changes required.

**Edge cases**
- Card with no milestone → no indicator.
- Multiple milestones on one card → flag the earliest overdue one.
- Timezone: compare dates in the user's local timezone (use `new Date()` on the client, date-only comparison).

---

### SPEC: HTML Artifact Page Type

**Problem**
LLMs (Claude, ChatGPT, etc.) frequently generate self-contained HTML artifacts — interactive demos, data visualisations, calculators, mini-apps. Currently there is nowhere inside the platform to paste and render these. Users copy them to CodePen or similar, breaking the workflow.

**Concept**
A new `artifact` page type that renders a full-page sandboxed `<iframe srcdoc>` of user-supplied HTML. The left panel shows an HTML code editor; the right panel (or full view) renders the live result. Toggling between "code" and "preview" modes is the primary UX.

**Data model**
No new table. An artifact page stores its HTML in the existing `pages.content` column as a plain JSON blob `{ "type": "artifact", "html": "<string>" }` — same pattern as board pages using Yjs, but simpler (no collaboration needed for v1).

**API**
No new endpoints. Use existing `PATCH /pages/:pageId` to save content. The artifact content is just a string stored in the page content field.

**New page type**: `'artifact'` added to `PageType` enum (server DTO + client types).

**Frontend** (`apps/client/src/features/artifact/`)
- `artifact-page.tsx` — top-level page wrapper, reads `page.content.html`, renders split layout.
- `artifact-editor.tsx` — controlled `<textarea>` (or CodeMirror if already available) for the raw HTML source.
- `artifact-preview.tsx` — `<iframe sandbox="allow-scripts" srcdoc={html} />`. The `sandbox` attribute must NOT include `allow-same-origin` — this is the critical security constraint.
- Header: "Edit" / "Preview" / "Split" mode toggle buttons (hide TipTap-related header items same as board).
- Auto-save: debounced 1 s after last keystroke, same pattern as other page types.
- Sidebar: "HTML Artifact" as a new page creation option in `space-sidebar.tsx`.

**Security**
- `<iframe sandbox="allow-scripts">` without `allow-same-origin`: scripts run in a separate origin and cannot access cookies, localStorage, or the parent DOM. This is the standard approach used by CodePen, StackBlitz, and Claude's own artifact renderer.
- Never inject user HTML into the main document DOM — always via `srcdoc`.
- Content-Security-Policy header for the app should already block inline scripts in the main document; iframe sandbox is an additional layer.

**Collaboration**
- v1: no real-time collab. Last write wins. Flag in code for future Yjs upgrade.

**Edge cases**
- Empty HTML → preview shows blank iframe (no error).
- Very large HTML (> 500 KB) → warn user, still save.
- Non-artifact page accidentally given `type: artifact` via API → treat missing `html` key as empty string.

---

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
```
