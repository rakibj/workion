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

**Package manager**: pnpm 10 with NX for task orchestration. Dependency overrides, `patchedDependencies`, and `neverBuiltDependencies` live in `pnpm-workspace.yaml` (not `package.json`) — this is the correct location for pnpm v10+.

---

## Tech Stack

| Layer              | Technology                                                 |
| ------------------ | ---------------------------------------------------------- |
| Backend framework  | NestJS (modular, DI-based)                                 |
| Database           | PostgreSQL 18                                              |
| Query builder      | Kysely (typed SQL — NOT an ORM)                            |
| Migrations         | Kysely migrations (`apps/server/src/database/migrations/`) |
| Caching            | Redis + `@nestjs/cache-manager`                            |
| Job queue          | BullMQ (Redis-backed)                                      |
| Real-time collab   | Hocuspocus + Yjs ← **BLACK BOX**                           |
| Frontend framework | React 18                                                   |
| Build tool         | Vite                                                       |
| UI library         | Mantine                                                    |
| Editor             | TipTap ← **BLACK BOX**                                     |
| Auth               | JWT sessions, CASL for RBAC                                |
| Storage            | S3-compatible or local (`StorageService`)                  |
| Email              | Configurable via `MailModule`                              |

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
config: {
  url;
} // @nestjs-labs/nestjs-ioredis
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
APP_URL=http://localhost:5173   # Vite frontend dev URL — used for invite links, emails, etc.
SERVER_URL=http://localhost:3000  # NestJS backend — Vite proxies /api here; omit in production
APP_SECRET=<long-random-string>
DATABASE_URL=postgresql://docmost:docmost_dev_pass@localhost:5432/docmost
REDIS_URL=redis://localhost:6379
```

---

## Cloud Deployment Status

> Credentials in `Cloud Implementation.md` (never commit).

| Service      | Where                               | Notes                                                                                                                                              |
| ------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| App (NestJS) | Contabo VPS — Docker                | `https://workion.gameloops.io` (Caddy + Let's Encrypt)                                                                                             |
| Redis        | Contabo VPS — Docker                | `REDIS_URL=redis://redis:6379`                                                                                                                     |
| Postgres     | Contabo VPS — Docker (`/opt/infra`) | standalone infra stack, container `infra-postgres-1`, volume `infra-postgres-data`, `DATABASE_URL=postgresql://docmost:<pw>@postgres:5432/docmost` |
| File storage | Cloudflare R2                       | bucket: `workion`, uses `AWS_S3_*` prefix                                                                                                          |

**Domain:** `workion.gameloops.io` → `157.173.120.4`. TLS via Caddy (Let's Encrypt). `Caddyfile` + `docker-compose.prod.yml` already configured.

**Upstash abandoned** — BullMQ exhausted the free tier in ~10 days. Now using local Redis.

**Neon abandoned** — free-tier egress hit 81%. Migrated to local Postgres container on the VPS (2026-06-13). Data dumped with `pg_dump -Fc --no-owner --no-acl` via `docker run --rm postgres:18`, restored with `pg_restore --clean --if-exists`. No `sslmode` or `pgbouncer` params — internal Docker network, plain TCP. Daily backups to R2 via `backup.sh` (cron 2 AM). Postgres 18+ requires volume mount at `/var/lib/postgresql` (not `/var/lib/postgresql/data`) — it creates the versioned subdirectory itself.

**Postgres extracted to standalone infra stack (2026-06-13)** — Postgres no longer lives inside Workion's compose project. It runs as an independent stack at `/opt/infra/docker-compose.yml` with its own named volume `infra-postgres-data` and network `infra-net`. Workion's `app` service joins `infra-net` as an external network and reaches Postgres via the `postgres` service-name DNS alias — no `DATABASE_URL` change required. `backup.sh` now targets `infra-postgres-1` directly via `docker exec` (not `docker compose exec`). To add a new app's database: `docker exec -it infra-postgres-1 psql -U docmost` then `CREATE DATABASE … / CREATE USER … / GRANT …`.

### Disaster recovery — restore from R2 backup

```bash
source /home/apps/workion/.env
aws s3 cp "s3://${AWS_S3_BUCKET}/backups/postgres/<dump-file>" /tmp/restore.dump \
  --endpoint-url "https://${AWS_S3_ENDPOINT}"

docker exec -it infra-postgres-1 \
  psql -U docmost -c "DROP DATABASE docmost WITH (FORCE); CREATE DATABASE docmost OWNER docmost;"

cat /tmp/restore.dump | docker exec -i infra-postgres-1 \
  pg_restore -U docmost -d docmost --no-owner --no-acl
```

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

## Blog — Live Custom Domain Setup

How blog publishing behaves in production, and the runbook for pointing a client's domain at their space's blog. `BlogRenderController`/`BlogSeoController` resolve which space to serve purely from the request's `Host` header, looked up against `spaces.settings.blog.domain` in the DB at request time — there is no code path that needs redeploying per domain.

**Primary domain (`workion.gameloops.io`) — zero setup.** Every space's published posts (a post needs a `shares` row, i.e. actually published, not just saved settings) are automatically reachable at `https://workion.gameloops.io/blog/:slug`, `/blog/sitemap.xml`, `/blog/rss.xml`. `basePath` is ignored here regardless of whether it's set — it only applies once a custom domain is configured for that space.

**Custom domain per space — 4 manual steps, no app rebuild:**

1. Space admin sets **Blog domain** (and optional **Blog path**, e.g. `/blogs`) under Space Settings → Blog. This only writes to `spaces.settings.blog`; it does nothing on its own until steps 2–3 are done.
2. Point DNS for that domain at the VPS: A record → `157.173.120.4` (or CNAME to `workion.gameloops.io` for a subdomain).
3. Add a site block to `Caddyfile` on the VPS and restart Caddy:
   ```
   client-domain.com {
       reverse_proxy app:3000
   }
   ```
   ```bash
   docker compose -f docker-compose.prod.yml restart caddy
   ```
   DNS must already resolve to the VPS **before** this restart — Caddy's automatic HTTPS needs to complete an ACME HTTP-01 challenge against the domain to issue the Let's Encrypt cert. If DNS isn't propagated yet, Caddy retries in the background rather than failing hard, but the domain won't serve HTTPS until it succeeds.
4. Once DNS + cert are live, the domain immediately serves that space's blog — `https://client-domain.com/<slug>` (or `/<basePath>/<slug>` if a path was set), plus `/sitemap.xml`, `/rss.xml`, `/robots.txt` at that domain's root or basePath.

**Scaling caveat:** every new client domain currently means hand-editing `Caddyfile` and restarting the `caddy` container — fine for a handful of clients, doesn't scale to many. If/when that becomes a bottleneck, Caddy's `on_demand_tls` with an `ask` endpoint (hitting the app to check `spaces.settings.blog.domain` before issuing a cert automatically) would remove the manual Caddyfile edit per domain — not implemented, flagged here as the likely next step.

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
UserRole: owner | admin | member; // workspace level
SpaceRole: admin | writer | reader; // space membership level
PagePermissionRole: writer | reader; // page-level override
```

`space_members`: member is either a **user** OR a **group** (DB check constraint).

**Page access:** No restriction → space role determines read/write. Restricted → only users/groups in `page_permissions` can access (space membership still required as outer gate).

**CASL** (`apps/server/src/core/casl/`): `workspace-ability.factory.ts` + `space-ability.factory.ts`. Never bypass — add new abilities through the factory pattern.

---

## Database Schema (Key Tables)

Generated types: `apps/server/src/database/types/db.d.ts` (auto-generated, do not hand-edit).

| Table                               | Purpose                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `workspaces`                        | Top-level tenant                                           |
| `users`                             | Workspace-scoped users                                     |
| `groups` / `group_users`            | Role grouping                                              |
| `spaces`                            | Document spaces                                            |
| `space_members`                     | User or group → space role                                 |
| `pages`                             | Hierarchical docs (parent_id self-ref)                     |
| `page_permissions`                  | Per-page user/group overrides                              |
| `page_access`                       | Restriction flag per page                                  |
| `page_history`                      | Full revision history                                      |
| `comments`                          | Threaded page comments                                     |
| `attachments`                       | File attachments                                           |
| `workspace_invitations`             | Invite flow                                                |
| `shares`                            | Public share links                                         |
| `labels` / `watchers` / `favorites` | Tagging, subscriptions, starred                            |
| `kanban_tasks` / `kanban_columns`   | Kanban board data                                          |
| `templates`                         | Page templates                                             |
| `workspace_ai_config`               | OpenRouter API key (encrypted)                             |
| `page_reads`                        | Last-read timestamp per (user, page) — drives unread badge |

New tables go in new migration files. Never alter existing migrations.

---

## Server Module Map

### Work areas

| Path                     | What it is                          |
| ------------------------ | ----------------------------------- |
| `core/auth/`             | Login, registration, session        |
| `core/workspace/`        | Workspace CRUD, user management     |
| `core/space/`            | Space CRUD, member management       |
| `core/page/`             | Page CRUD, tree, history            |
| `core/page/page-access/` | Permission enforcement              |
| `core/casl/`             | CASL ability factories              |
| `core/user/`             | User profile                        |
| `core/group/`            | Group management                    |
| `core/comment/`          | Comments                            |
| `core/label/`            | Labels                              |
| `core/kanban/`           | Kanban board                        |
| `core/ai-chat/`          | AI chat — OpenRouter BYOK streaming |
| `core/notification/`     | In-app notifications                |
| `core/template/`         | Page templates                      |
| `database/migrations/`   | Schema migrations                   |
| `database/repos/`        | Data access layer                   |

### Black boxes (do not modify unless you must)

| Path                    | Why hands-off                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `collaboration/`        | Hocuspocus engine — additive touches only                                                      |
| `apps/editor-ext/`      | TipTap extensions                                                                              |
| `apps/ee/`              | Enterprise Edition — conditionally loaded                                                      |
| `integrations/storage/` | Use `StorageService`, don't re-implement                                                       |
| `integrations/mail/`    | Use `MailModule`, don't touch internals                                                        |
| `integrations/queue/`   | Add new jobs/queues, don't change infra                                                        |
| `integrations/export/`  | HTML/Markdown/DOCX export — extend via `ExportService`; `docx-utils.ts` for DOCX preprocessing |
| `integrations/import/`  | MD/HTML/DOCX import — extend via `ImportService`                                               |

---

## Client Module Map

### Work areas

| Path                           | What it is                       |
| ------------------------------ | -------------------------------- |
| `features/auth/`               | Login/signup UI                  |
| `features/workspace/`          | Workspace settings               |
| `features/space/`              | Space listing, settings, members |
| `features/page/`               | Page tree, page view             |
| `features/user/`               | User profile                     |
| `features/group/`              | Group management UI              |
| `features/home/`               | Dashboard                        |
| `features/page/kanban/`        | Kanban board                     |
| `features/ai-chat/`            | AI chat panel + key settings     |
| `features/notification/`       | Notification bell + popover      |
| `apps/client/src/ee/template/` | Page templates UI                |

### Black boxes

| Path                     | Why hands-off      |
| ------------------------ | ------------------ |
| `features/editor/`       | TipTap integration |
| `features/transclusion/` | Page embedding     |
| `features/websocket/`    | Real-time sync     |

---

## Signup Behaviour

Workspace creation (signup) is **always enabled** — no env var gate.

- **Backend**: `SetupGuard` always returns `true` (non-cloud). `GET /api/auth/setup-config` always returns `{ allowSignup: true }`.
- **Frontend**: Default landing (`/`) redirects to `/setup/register`. Login page has a "Sign up" link. Signup page has a "Sign in" link.
- Invitations and login always work regardless.

---

## Implemented Custom Features

### Space Invite Links (Guest Access)

Shareable invite links for spaces. Backend: `core/space/services/space-invite-link.service.ts`, controller at `spaces/invite-links/*`, `space_invite_links` table (token, spaceRole, expiresAt, maxUses, useCount). Auth endpoints: `GET /auth/invite-link/:token` (public info), `POST /auth/invite-link/signup` (new guest account), `POST /auth/invite-link/join` (existing user). `spaceRole` is `reader | commenter | writer` — `commenter` (can read + comment, no Settings access) is the typical guest role; joining always adds the user to the workspace as `UserRole.GUEST` and to the space with the given role. "Space Settings" UI is hidden when `spaceAbility.cannot(Read, Settings)` — commenter has no Settings ability. Frontend: `SpaceInviteLinks` component in space settings, `InviteLinkPage` at `/invite/:token`.

**Comment permission system:** `SpaceRole.COMMENTER` (commenter) added alongside reader/writer/admin. `SpaceCaslSubject.Comment` added; only admin/writer/commenter get `can(Create, Comment)` — readers cannot comment. `PagePermissionRole.COMMENTER` added for page-level overrides. Backend `validateCanComment` enforces: unrestricted pages → CASL `Create Comment` ability required; restricted pages → page-level role must be commenter or writer. `page.permissions.canComment` returned from both page info endpoints and used on frontend to gate: inline comment dialog (page-editor), comment sidebar panel (comment-list-with-tabs), reply editors, and `@mention`. The `Share` option in the page header is hidden for workspace guests (`user.role === 'guest'`).

### AI Chat (BYOK via OpenRouter)

OpenRouter key stored per workspace in `workspace_ai_config` (encrypted). Backend: `core/ai-chat/` — streaming chat, page content injection, auto-title. Frontend: slide-over panel with thread list + model selector; key UI in workspace settings. All AI routes through OpenRouter only — no direct Anthropic/OpenAI calls.

### Kanban Board Page

`kanban` page type. Backend: `core/kanban/`, tables `kanban_tasks`/`kanban_columns`. Frontend: `features/kanban/`, Atlaskit pragmatic DnD; assignees, due dates, priority. Realtime: WS events `kanbanCardMoved`/`kanbanColumnMoved` on `page-${pageId}` room; filtered by `userId` to skip self. Milestone badge turns red (overdue) / amber (today).

### Blog Publishing Platform (in progress)

`blog` is a page type with per-post metadata in `blog_post_settings` and a per-space hostname at `spaces.settings.blog.domain`/`basePath`. The authenticated API lives in `core/blog/`: `GET`/`POST /blog/posts/:pageId/settings`, `POST /blog/posts/:pageId/publish`, and `POST /blog/posts/:pageId/unpublish`; **publishing requires a `shares` row for the page** — `findPublishedBySlug`/`findPublishedBySlugAnywhere` inner-join `shares`, so a post with saved settings but no share (never published, or unpublished) 404s as "Blog post not found" even though its settings exist. Space administrators update the hostname through `PATCH /spaces/:spaceId/blog-settings`. The client exposes Blog Post creation, a post settings modal (`blog-settings-modal.tsx`, shows the live published URL with copy/open-in-new-tab once a `shares` row exists), and a Blog tab in space settings (`space-blog-settings.tsx`, warns when `basePath` is set without a `domain` since basePath is ignored without one). Public JSON endpoints are at `/api/public/blog/posts`; custom domains and `/blog/:slug` render server-side via `BlogRenderController`. Domain-resolved `/sitemap.xml`, `/rss.xml`, and `/robots.txt` complete the technical-SEO routes. Refer to `specs/BLOG_MASTER_SPEC.md` for the implementation record.

**Custom-domain routing (`BlogRenderController`) is resolved by the NestJS server directly via the request `Host` header** — it does not go through the Vite dev proxy (only `/api` and `/blog` are proxied in `vite.config.ts`). On the primary app domain (`APP_URL`'s hostname), every space's published posts are served at the shared `/blog/:slug` path regardless of any per-space `basePath` — `basePath` only applies once a custom domain is configured for that space.

To test a custom blog domain locally: add a hosts-file entry for a dotted hostname (e.g. `blog.local` — the domain validator rejects single-label names like `localhost`) pointing at a loopback address, set it as the space's "Blog domain", and hit the backend directly on its own port — `http://blog.local:3000/...` (or with `basePath`, `http://blog.local:3000/<basePath>/<slug>`) — not through the Vite dev server on 5173. The client's `getBlogDomainOrigin()` (`lib/config.ts`) builds this automatically for the live-link display in the settings modal, using `SERVER_URL` (now exposed to the client bundle via `vite.config.ts`'s `define`) in dev and a bare `https://` origin in prod (Caddy terminates TLS there). In prod, a new custom domain also needs a DNS record pointing at the VPS and a new Caddyfile site block reverse-proxying to `app:3000` — no automation for that yet.

**Blog post custom fields.** Space admins define an arbitrary metadata schema at `spaces.settings.blog.customFields` (`{ key, label, type: 'boolean'|'number'|'text' }[]`, edited in the "Custom fields" section of `space-blog-settings.tsx`, unique keys enforced in `SpaceService.updateBlogSettings`). Per-post values live in the new `blog_post_settings.custom_fields` JSONB column (migration `20260729T000000-blog-post-custom-fields.ts`), edited in `blog-settings-modal.tsx` via inputs generated from the space's schema. `BlogPostSettingsService.upsert()` strictly validates incoming `customFields` against the space's schema (unknown key or type mismatch → 400) before persisting. `BlogPublicService.serializePost()` always includes `customFields` in both list and single-post responses at `/api/public/blog/posts`, so consumers can pull fields like `isFeatured`/`priority` straight from the public JSON API and filter/sort client-side — there is no server-side filter/sort query param for this in v1. Removing or renaming a schema field does not scrub already-stored post values (they just stop rendering in the settings modal).

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

### Sidebar Inline Page Rename — DONE

`...` context menu on sidebar page items includes a "Rename" option (canEdit only). Clicking it replaces the page title `<span>` with an inline `<input>` pre-filled and auto-focused. Enter/blur → saves via existing `handleRename()` (skips API if unchanged or empty). Escape → reverts. Files: `space-tree-node-menu.tsx`, `space-tree-row.tsx`, `tree.module.css`.

### Unread Page Notification Badge — DONE

Blue number badge on sidebar page items for pages with unread notifications directed at the current user. Clears when the user navigates to the page.

- **DB**: new `page_reads` table (migration `20260607T000000-page-reads.ts`). `page_id` was already on `notifications`.
- **Backend**: `PageReadsRepo` — `upsert`, `getUnreadCounts`, `getUnreadCount`. `NotificationService.create()` emits `pageUnreadCountChanged` WS event after inserting a page-scoped notification. Two new endpoints: `POST /pages/unread-counts` and `POST /pages/mark-read`.
- **Frontend**: `pageUnreadCountsAtom` (Jotai). Initial fetch + WS subscription in `use-notification-socket.ts`. Badge in `SpaceTreeRow`. `useMarkPageRead` called in `PageContent` on page ID change.

### Toggle Heading 1 / 2 / 3 — DONE

Collapsible headings (H1/H2/H3) where the heading text is the toggle trigger, similar to Notion's toggle headings.

- **Extension files:** `packages/editor-ext/src/lib/toggle-heading/` — `ToggleHeading` (outer wrapper node, `data-type="toggleHeading"`, attrs: `level: 1|2|3`, `open: bool`), `ToggleHeadingTitle` (inline heading content, styled via CSS per level), `ToggleHeadingContent` (collapsible body, `block*`).
- **Commands:** `setToggleHeading({ level })` (wraps current block; updates level if already in toggleHeading), `unsetToggleHeading()` (converts back to heading + body blocks), `toggleToggleHeading({ level })` (toggle/change level).
- **Input rules:** `#> ` → Toggle H1, `##> ` → Toggle H2, `###> ` → Toggle H3.
- **CSS:** `apps/client/src/features/editor/styles/toggle-heading.css` — heading-size styling per level via `data-level` attribute, open/close via `[open]` attribute, content indented 1.5rem when open, caret rotates 90° when open, search-result auto-expand.
- **No keyboard shortcuts** — conflicts with `Mod-Alt-1/2/3` which are bound to plain headings by the StarterKit Heading extension.
- **Keyboard UX:** `Enter` in title → opens toggle + moves cursor into content; `Backspace` at title start → `unsetToggleHeading()`.
- **Slash menu:** "Toggle Heading 1/2/3" entries (search terms include "toggle", "h1/h2/h3", "collapsible", "expand").
- **Turn-into menu (block menu) + bubble menu (node selector):** Toggle H1/H2/H3 entries added.
- **Placeholder:** level-aware ("Heading 1" / "Heading 2" / "Heading 3") via parent node lookup in `Placeholder.configure()`.
- **`open` state is local only** — not synced across users (same as toggle block).

### DOCX Export & Import — DONE

Single-page DOCX export and DOCX import via `mammoth`. No round-trip fidelity guarantee — DOCX is an exchange format.

- **Dependencies added (server):** `html-to-docx`, `katex`, `mammoth`
- **Export pipeline:** `pageJson → jsonToHtml() → preprocessHtmlForDocx() → html-to-docx → Buffer`. `preprocessHtmlForDocx` (cheerio-based, in `integrations/export/docx-utils.ts`) runs in order: inline attachment images as base64 data URIs from storage, convert math blocks/inline via KaTeX HTML, callout → styled blockquote, unwrap columns, unwrap attachment nodes to their inner `<a>`, strip unrenderable nodes (subpages, transclusion), strip data-\* attrs.
- **`ExportFormat.Docx = 'docx'`** added to enum in `export-dto.ts` (backend) and `page.types.ts` (frontend). `ExportPageDto` and `ExportSharedPageDto` `@IsIn` validators include `'docx'`. `ExportSpaceDto` intentionally excludes docx (ZIP multi-page not supported).
- **`exportPages()`**: docx always treated as single-page (never zipped). `exportPage()` return type widened to `string | Buffer | undefined`.
- **Import**: `processDocx()` in `import.service.ts` replaced EE dynamic-require with direct `mammoth.convertToHtml({ buffer }, { includeDefaultStyleMap: true })` → `processHTML()`. Signature simplified to `(fileBuffer: Buffer)`. Pre-assigned `pageId` removed for DOCX (still present for PDF/EE).
- **Frontend**: "Word (.docx)" added to format selector in `ExportModal` (page export only — space export omitted) and `ShareExportModal`. Subpage/attachment toggles hidden when docx is selected.

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

## Pending Features (Approved Specs)

**Active spec:** [specs/BLOG_MASTER_SPEC.md](specs/BLOG_MASTER_SPEC.md) — Blog Publishing Platform. The approved 2026-07-29 implementation batch completes Spec 2 and implements Specs 3–4 as one publish-to-render vertical slice; it tracks per-session scope and progress/handover in its own tracker table.

---

## Completed Integrations

**Env vars (both local `.env` and VPS):**

```
MAIL_DRIVER=smtp
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USERNAME=resend
SMTP_PASSWORD=<resend-api-key>   # no inline comments — dotenv doesn't strip them
MAIL_FROM_ADDRESS=noreply@workion.gameloops.io
MAIL_FROM_NAME=Workion
```

**To redeploy after env change (no rebuild):**

```bash
docker compose -f docker-compose.prod.yml restart app
```
