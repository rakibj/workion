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

### Spec: In-Place AI Text Improvement — Backend Fix

**Status:** Not started. Frontend fully implemented; backend endpoint missing.

**Root cause:** `ai-service.ts` calls `POST /api/ai/generate/stream` and `POST /api/ai/generate` but neither route exists. `AiStreamService` is functional — only the controller is missing.

**Files to create/change:**

| File | Change |
|------|--------|
| NEW `apps/server/src/core/ai-chat/controllers/ai-generate.controller.ts` | Two routes: `POST /ai/generate/stream` (SSE) and `POST /ai/generate` (non-streaming) |
| NEW `apps/server/src/core/ai-chat/dto/ai-generate.dto.ts` | `{ action: AiAction, content: string, prompt?: string }` with validation |
| `apps/server/src/core/ai-chat/ai-chat.module.ts` | Register new controller |

**Controller logic (`/ai/generate/stream`):**
1. Validate body with `AiGenerateDto`
2. Map `action` → system prompt (see table below)
3. Call `AiStreamService.streamChat(workspace.id, [{ role: 'user', content }], systemPrompt)`
4. Stream `data: { content: text }\n\n` chunks (matching client's `AiStreamChunk` type), end with `data: [DONE]\n\n`
5. No message persistence, no chat creation — pure one-shot transformation

**Action → system prompt mapping:**

| AiAction | System prompt |
|----------|--------------|
| `IMPROVE_WRITING` | "Improve the writing quality of the following text. Return only the improved text, no explanations." |
| `FIX_SPELLING_GRAMMAR` | "Fix all spelling and grammar errors. Return only the corrected text." |
| `MAKE_SHORTER` | "Make the following text more concise while preserving meaning. Return only the shortened text." |
| `MAKE_LONGER` | "Expand the following text with more detail. Return only the expanded text." |
| `CONTINUE_WRITING` | "Continue writing from where this text leaves off. Return only the continuation." |
| `EXPLAIN` | "Explain the following text in simple terms. Return only the explanation." |
| `SUMMARIZE` | "Summarize the following text. Return only the summary." |
| `CHANGE_TONE` | `"Rewrite the following text in a ${prompt} tone. Return only the rewritten text."` |
| `TRANSLATE` | `"Translate the following text to ${prompt}. Return only the translated text."` |
| `CUSTOM` | Use `prompt` field directly as the instruction |

**SSE streaming pattern** — follow the exact same `reply.hijack()` + `raw.write()` + `raw.end()` pattern from `AiChatController.send()`.

**Key files for reference:**
- Client types: `apps/client/src/ee/ai/types/ai.types.ts`
- Client service: `apps/client/src/ee/ai/services/ai-service.ts`
- Streaming infra: `apps/server/src/core/ai-chat/services/ai-stream.service.ts`
- Pattern to follow: `apps/server/src/core/ai-chat/controllers/ai-chat.controller.ts` (`send` method)

---

### Spec: Block Handle Context Menu

**Status:** Not started. All building blocks exist; only the assembly is missing.

**What it does:** Clicking the drag handle (⠿) opens a context menu with block-level actions. Drag behavior is unchanged — browsers distinguish a clean click from a drag on `draggable="true"` elements.

#### Architecture

**1. Extend `drag-handle.ts` (additive only)**

Add two closure variables tracking the last hovered node:
```ts
let currentNodePos: number = -1;
let currentNodeType: string = '';
```

Update both in the `mousemove` handler alongside the handle's CSS repositioning. Add a `click` listener on `dragHandleElement` in the `view` factory (after drag listeners):
```ts
dragHandleElement.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  view.dom.dispatchEvent(new CustomEvent('blockHandleClick', {
    bubbles: true,
    detail: { pos: currentNodePos, nodeType: currentNodeType, x: e.clientX, y: e.clientY },
  }));
});
```
Clean up in `destroy()`. Do not add the listener if `!view.editable` (guard same as the existing mousemove guard).

**2. New `BlockContextMenu` component**

```
apps/client/src/features/editor/components/block-menu/
  block-menu.tsx
  block-menu.module.css
```

Props: `{ editor, opened, onClose, pos, nodeType, x, y }`

Positioned `fixed` at `{ left: x, top: y }` with a small offset. Uses Mantine `Menu`.

**Menu structure:**

```
[Turn into ▶]           submenu reusing NodeSelector items
─────────────
[🎨 Text color ▶]      submenu → 10-color swatch grid (Color extension)
[🖍 Background ▶]      submenu → 10-color swatch grid (Highlight extension)
─────────────
[📋 Duplicate]
[🔗 Copy link to block]  heading nodes only (they have stable id attrs)
─────────────
[✨ Ask AI]
─────────────
[🗑 Delete block]
```

Context-sensitivity:
- **Turn into**: hidden for `table`, `codeBlock`, `htmlArtifact`, `image`, `video`, `audio`
- **Text/Background color**: hidden for `table`, `htmlArtifact`, `image`, `video`, `audio`
- **Copy link to block**: only heading nodes
- **Read-only mode** (`!editor.isEditable`): entire menu suppressed — don't fire the event

**Commands:**

| Action | TipTap command |
|--------|---------------|
| Turn into (any) | Reuse commands from `node-selector.tsx` |
| Text color | `editor.chain().focus().setColor(hex).run()` |
| Background | `editor.chain().focus().setHighlight({ color: hex }).run()` |
| Duplicate | `editor.chain().focus().insertContentAt(pos + nodeSize, node.toJSON()).run()` |
| Delete | `editor.chain().focus().deleteNode(nodeType).run()` |
| Copy link | `navigator.clipboard.writeText(location.href + '#' + headingId)` |
| Ask AI | Select block via `NodeSelection.create(doc, pos)`, then trigger `EditorAiMenu` |
| Clear color | Pass `undefined` to `setColor` / `unsetHighlight()` |

**"Ask AI" flow:**
1. `editor.commands.setNodeSelection(pos)` to select the block
2. Extract `editor.state.doc.nodeAt(pos)?.textContent`
3. Trigger the same AI menu used by the bubble menu — check how `EditorAiMenu` is opened in `page-editor.tsx` and replicate that trigger

**Color palette (10 colors):**
Default (clear) · Gray `#9B9A97` · Brown `#64473A` · Orange `#D9730D` · Yellow `#CB912F` · Green `#448361` · Blue `#337EA9` · Purple `#9065B0` · Pink `#C14C8A` · Red `#D44C47`

**3. Wire into editor wrapper**

In `advanced-editor.tsx` (or wherever `EditorContent` is rendered), add `useEffect`:
```ts
const handler = (e: CustomEvent) => {
  if (!editor?.isEditable) return;
  setBlockMenu({ opened: true, ...e.detail });
};
editorWrapperRef.current?.addEventListener('blockHandleClick', handler);
```
Render `<BlockContextMenu ... />` inside the wrapper. Manage open/close state.

**Files changed/created:**

| File | Change |
|------|--------|
| `extensions/drag-handle.ts` | Track `currentNodePos`/`currentNodeType` in mousemove; add click listener firing `blockHandleClick` custom event; clean up in destroy |
| NEW `components/block-menu/block-menu.tsx` | Context menu component |
| NEW `components/block-menu/block-menu.module.css` | Styles |
| Editor wrapper (`advanced-editor.tsx` or equivalent) | Event listener, open/close state, render `BlockContextMenu` |

**Edge cases:**
- Click inside table → Turn into and Color sections hidden
- Heading with no `id` attr → Copy link hidden
- Menu opened while dragging → Mantine Menu `closeOnClickOutside` handles it; drag still fires normally
- Empty doc / first block → Duplicate appends at end; no crash

**Out of scope for V1:** right-click context menu, move-to-page, block locking, per-block comment threading

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
