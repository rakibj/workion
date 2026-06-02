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

> Specs live here only while work is **in progress or not started**. Remove a spec once the feature is fully shipped — the code and git history are the permanent record.

---

### SPEC: AI Chat — OpenRouter BYOK

**Status**: `In progress` — step 1 complete (2026-06-03)

**Goal**: Implement the AI chat backend (the `/api/ai/chats/*` routes the client already calls) using OpenRouter as the provider. Each workspace funds its own AI usage by supplying its own OpenRouter API key — no platform-level billing involved.

---

#### Decision

Pure BYOK — no global fallback key. If a workspace has no key configured, AI chat is disabled for that workspace. This keeps billing 100% between the workspace and OpenRouter.

---

#### Data Model Delta

No new table. Add `openrouterKey` (encrypted string) and `openrouterModel` (string) to the existing `workspace.settings.ai` JSONB field.

```jsonc
// workspace.settings.ai (extended)
{
  "chat": true,
  "generative": true,
  "search": false,
  "openrouterKey": "<AES-256 encrypted>",   // null if not configured
  "openrouterModel": "openai/gpt-4o-mini"   // default if not set
}
```

Key is encrypted before write and decrypted on read using `APP_SECRET` (AES-256-GCM). Never returned to the client — only used server-side when making OpenRouter requests.

---

#### API Contract (new endpoints — all require `JwtAuthGuard`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/ai/chats/create` | Create new chat, return `AiChat` |
| `POST` | `/ai/chats` | List chats (paginated cursor) |
| `POST` | `/ai/chats/info` | Get chat + messages by `chatId` |
| `POST` | `/ai/chats/delete` | Soft-delete a chat |
| `POST` | `/ai/chats/update` | Update chat title |
| `POST` | `/ai/chats/search` | Full-text search across messages |
| `POST` | `/ai/chats/upload` | Upload file attachment for a chat |
| `POST` | `/ai/chats/send` | **Streaming SSE** — send message, stream response |

`/ai/chats/send` streams `text/event-stream`. Event types match what the client already handles: `chat_created`, `content`, `tool_call`, `tool_result`, `done`, `error`.

New workspace-settings endpoints (admin only):

| Method | Path | Description |
|---|---|---|
| `POST` | `/workspace/ai/key` | Save (or update) OpenRouter key + model |
| `DELETE` | `/workspace/ai/key` | Remove the key (disables AI chat) |
| `GET` | `/workspace/ai/key/status` | Returns `{ configured: boolean, model: string }` — never the key itself |

---

#### Backend Module

New module: `apps/server/src/core/ai-chat/`

```
ai-chat/
├── ai-chat.module.ts
├── controllers/
│   ├── ai-chat.controller.ts       # /ai/chats/* routes
│   └── workspace-ai.controller.ts  # /workspace/ai/key routes
├── services/
│   ├── ai-chat.service.ts          # chat CRUD + message persistence
│   ├── ai-stream.service.ts        # OpenRouter streaming logic
│   └── ai-key.service.ts           # encrypt/decrypt key, save to settings
├── dto/
│   └── *.dto.ts
└── repos/
    └── ai-chat.repo.ts             # queries against ai_chats + ai_chat_messages
```

`ai-stream.service.ts` uses the OpenAI SDK pointed at `https://openrouter.ai/api/v1` with the workspace's decrypted key. All requests include `HTTP-Referer` and `X-Title` headers per OpenRouter's requirements.

---

#### Key Encryption

```ts
// Encrypt before storing
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
// Store: base64(iv + authTag + ciphertext)

// Decrypt on read
// Split stored value → iv, authTag, ciphertext → decipher
```

`derivedKey` = `scrypt(APP_SECRET, workspaceId, 32)` — workspace-scoped so a key from one workspace cannot decrypt another.

---

#### Frontend

**Workspace settings — new "AI" panel** (`apps/client/src/features/workspace/components/ai-settings.tsx`):
- Text input for OpenRouter API key (masked, write-only — never shown after save)
- Model selector dropdown (curated list of OpenRouter model IDs)
- Save / Remove key button
- Status indicator: "AI chat active" / "No key configured"

The existing `enable-ai-chat.tsx` toggle remains but is gated: only meaningful once a key is configured.

No changes needed to the existing AI chat UI (`apps/client/src/ee/ai-chat/`) — it already handles all the stream events correctly.

---

#### Permission / Access Control

- Saving/removing the key: `owner` or `admin` role only (enforced in `workspace-ai.controller.ts`)
- Using AI chat: any workspace member (existing `ai.chat` setting gates visibility)
- Key status endpoint: `owner` or `admin` only

---

#### Edge Cases

| Case | Handling |
|---|---|
| No key configured | `ai-stream.service` throws `ServiceUnavailableException("AI not configured for this workspace")` → client shows "AI not set up" error |
| Invalid / expired key | OpenRouter returns 401 → surface as `error` SSE event with `code: "invalid_key"` |
| Model not available | OpenRouter returns 404/400 → surface as `error` SSE event |
| User aborts stream | Client calls `AbortController.abort()` → server catches and closes stream cleanly |
| Attachment upload | Stored via existing `StorageService`; `ai_chat_id` column on `attachments` already exists (from existing migration) |

---

#### Implementation Order (TDD)

- [x] 1. `ai-key.service.ts` — encrypt/decrypt + save/load from `workspace.settings.ai` — 12 unit tests, all passing
- [x] 2. `workspace-ai.controller.ts` — save/remove/status endpoints — 9 unit tests, all passing
- [x] 3. `ai-chat.repo.ts` — CRUD queries against `ai_chats` + `ai_chat_messages` — covered by step 4 service mocks (no repo has unit tests in this codebase)
- [x] 4. `ai-chat.service.ts` — chat + message persistence — 13 unit tests, all passing
- [x] 5. `ai-stream.service.ts` — OpenRouter streaming via `@ai-sdk/openai-compatible` + Vercel AI SDK `streamText` — 4 unit tests, all passing
- [x] 6. `ai-chat.controller.ts` — all `/ai/chats/*` routes — 11 unit tests, all passing
- [x] 7. Register `AiChatModule` in `CoreModule`
- [ ] 8. Frontend: AI settings panel in workspace settings
- [ ] 9. Smoke test: configure key → open AI chat → send message → verify stream → remove key → verify disabled

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
