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
| `database/migrations/` | Schema migrations |
| `database/repos/` | Data access layer |

### Black boxes (do not modify unless you must)

| Path | Why hands-off |
|---|---|
| `collaboration/` | Hocuspocus real-time engine. Treat as black box — only additive touches allowed (new guards/conditions inside existing extensions, never restructuring). See Board spec for the approved pattern. |
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

### Black boxes

| Path | Why hands-off |
|---|---|
| `features/editor/` | TipTap integration — rich editor, leave alone |
| `features/transclusion/` | Page embedding feature |
| `features/websocket/` | Real-time sync |

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

---

### SPEC: Board Page Type (tldraw whiteboard)

**Status**: `APPROVED — pending implementation`

**Phases**:
- [ ] Phase 1 — Page type plumbing + static tldraw (no real-time)
- [ ] Phase 2 — Real-time sync via Hocuspocus + Yjs
- [ ] Phase 3 — Polish (thumbnail, export, read-only enforcement)

---

#### Problem

Pages can currently be `document` (TipTap editor) or `kanban` (custom REST-backed board). A third type — `board` — is needed: a freeform whiteboard with shapes, arrows, sticky notes, images, and real-time multi-user cursors, powered by [tldraw](https://github.com/tldraw/tldraw).

---

#### Data Model Delta

**No new table required.** The `pages.type` column already exists as a `varchar DEFAULT 'document'`. `'board'` is added as a third valid value.

The existing `pages.ydoc` binary column (used by the collaboration layer to store Yjs state) will store the tldraw Yjs snapshot. The `pages.content` and `pages.text_content` columns are left `null` for board pages.

Changes needed:
- `apps/server/src/core/page/dto/create-page.dto.ts` — add `'board'` to `@IsIn([...])`
- `apps/server/src/core/page/dto/update-page.dto.ts` — same
- `apps/client/src/features/page/types/page.types.ts` — add `| "board"` to `PageType`

No migration file needed (no schema change; the column exists and has no DB-level check constraint).

---

#### API Contract

No new endpoints. Board state is synced entirely over the existing WebSocket (`/collab`). All existing page REST endpoints (`GET /pages/:id`, `POST /pages`, `PATCH /pages/:id`, `DELETE /pages/:id`) apply unchanged.

**Room naming** — board rooms use the prefix `board.` instead of `page.`:

```
Document room:  page.{pageId}
Board room:     board.{pageId}
```

The existing `getPageId(documentName)` utility in `collaboration.util.ts` splits on `.` and takes index `[1]`. Because page IDs are UUIDs (no dots), this works unchanged for `board.{uuid}`. No change needed.

---

#### Black Box Touches (collaboration/)

These are **additive only** — no existing logic is removed or altered.

**`persistence.extension.ts`** (2 targeted additions):

```ts
// onLoadDocument — add after binary ydoc check:
if (page.type === 'board') {
  // board uses raw ydoc binary only; skip TipTap JSON→Ydoc conversion
  return document;
}

// onStoreDocument — guard before TipTap serialization:
if (page.type !== 'board') {
  // existing TipTap JSON + textContent extraction (unchanged)
}
// both paths save the ydoc binary (unchanged)
```

**`authentication.extension.ts`** — no change. The `getPageId` split already extracts the UUID correctly from `board.{pageId}`.

**`collaboration.module.ts`** — no change. Hocuspocus accepts any room name; board rooms are handled by the same extension chain.

---

#### Frontend Architecture

New feature directory: `apps/client/src/features/board/`

```
features/board/
├── components/
│   ├── board-page.tsx       # full-page wrapper (mirrors kanban-board-page.tsx)
│   └── board-editor.tsx     # <Tldraw> + Yjs sync setup
└── hooks/
    └── use-board-sync.ts    # HocuspocusProvider + Y.Doc → tldraw store wiring
```

**`use-board-sync.ts`** pattern:
1. Create `HocuspocusProvider` to `/collab`, room = `board.{pageId}`, token = auth JWT
2. From the provider's `Y.Doc`, get a `Y.Map` keyed `'tldraw'`
3. Create a tldraw store backed by that `Y.Map` (using tldraw's Yjs binding)
4. Return the store + connection status to `board-editor.tsx`

**`board-editor.tsx`**:
- Renders `<Tldraw store={store} />` from the `tldraw` package
- Shows a connection indicator (connecting / connected / offline)
- Read-only mode when user has `reader` role (pass `readOnly` prop to `<Tldraw>`)

**`apps/client/src/pages/page/page.tsx`** changes:
- Add lazy import: `const BoardPage = lazy(() => import("@/features/board/components/board-page"))`
- Add condition: `if (page.type === 'board') return <BoardPage />`

**New page menu** (wherever document/kanban options live): add "Board" entry with a whiteboard icon.

---

#### Packages to Add

```bash
# client only
pnpm --filter client add tldraw
```

`tldraw` includes the React component, store primitives, and the Yjs binding. No additional server packages needed.

---

#### Permission / Access Control

Board pages are gated by the **same** space + page access rules as documents. The existing `AuthenticationExtension` sets `readOnly: true` for reader-role users before the WebSocket session is established. tldraw's `readOnly` prop is driven by the page's effective permission (already returned by `GET /pages/:id` as part of the page object).

No CASL changes needed.

---

#### Edge Cases

| Case | Handling |
|---|---|
| User opens board with no content | tldraw renders empty canvas; Yjs doc is empty |
| Two users open simultaneously | Hocuspocus syncs Y.Doc updates; tldraw merges via CRDT |
| Reader opens board | `readOnly` passed to `<Tldraw>`; WebSocket still opens for live cursor visibility |
| Board page exported | Phase 3 — tldraw's built-in SVG/PNG export (no server involvement) |
| Page history | Ydoc binary snapshots stored as normal; no TipTap content to diff, history UI shows "board updated" entries only |
| tldraw WebSocket drops | HocuspocusProvider auto-reconnects; tldraw store survives locally and re-syncs on reconnect |

---

#### Implementation Order (TDD)

**Phase 1 — Type plumbing + static tldraw**
1. Update DTO validators (`@IsIn` in create + update DTOs) — write unit test first (red → green)
2. Update `PageType` in client types
3. Add `board` to new-page menu
4. Create `BoardPage` + `BoardEditor` with a basic `<Tldraw>` (no Yjs, persistence via `onBlur` save to `pages.content` as JSON snapshot)
5. Update `page.tsx` to route `board` type to `BoardPage`
6. Smoke test: create board page, draw something, reload, verify save

**Phase 2 — Real-time sync**
1. Add targeted guards in `persistence.extension.ts` (additive, as above)
2. Write `use-board-sync.ts` hook
3. Replace Phase 1 save-on-blur with Yjs-backed store
4. Test with two browser tabs: verify cursors and shapes sync
5. Verify existing document pages are unaffected

**Phase 3 — Polish**
1. Read-only enforcement via tldraw `readOnly` prop
2. PNG/SVG export button in board toolbar
3. Thumbnail generation for space page list (tldraw `exportToBlob`, store as attachment)

---

## Planned Client Management Features (Backlog — each needs a spec before implementation)

- [ ] **Client entity**: a new top-level concept (client org → maps to a space or workspace?)
- [ ] **Client portal**: restricted-access view for external client users
- [ ] **Project tracking**: tasks/milestones per client space
- [ ] **Client user invitations**: invite external users to specific spaces only
- [ ] **Activity feed per client**: audit trail scoped to a client
- [ ] **Client branding**: per-space logo/color theme

> Update this list as features are specced and completed.

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
