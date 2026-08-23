# CLAUDE.md — Docmost Client Management Fork

> **Living document.** Update this file at the start of each new feature. Keep it accurate as the project evolves — stale guidance is worse than none.

---

## Project Goal

Fork of [docmost](https://github.com/docmost/docmost) repurposed as an **agency/client delivery platform**: manage client work from brief to delivery/publication in one workspace. Docmost provides the document/wiki backbone (treated as infrastructure, not the sales proposition); the differentiation is the client workflow layered on top.

**Core vertical (the only workflow that matters):**

```
Onboard → Collaborate → Execute → Review → Approve → Deliver/Publish
```

**Anti-goal:** do not drift into "Docs + CRM + Kanban + Whiteboard + AI + Agents + Blog + Automation" as a horizontal workspace. Every new feature must serve the vertical above.

**Positioning decision (2026-08):** not "another Notion/Docmost alternative" — an agency client workspace where every client gets a portal, work moves through approval, and finished content can publish directly to the client's site. Full analysis in the AppSumo handoff doc.

---

## Editions: Internal vs Public

Workion currently runs **internally** (Gameloops/Cognitive Peak client work). A **public version** (AppSumo LTD launch) is planned. **Decision (2026-08): one repo, no second fork.** Edition differences are handled by feature flags, not branches or separate repos.

- Blog/publishing is **internal-only for now**. Public builds ship with it disabled via a feature flag.
- The blog module must stay **cleanly separable**: own module directory, own routes, registered conditionally. This serves three purposes at once — edition gating, a simpler AGPL audit boundary, and a future paid-tier entitlement check.
- **Decision (2026-08): runtime flags only, for now.** One deploy, features resolved per-workspace from a plan/entitlement attribute; internal workspaces resolve to "everything enabled." Revisit build-time exclusion only if the Pre-Launch Gate licensing audit below finds a specific feature that legally cannot ship hidden-but-present in the public bundle — that's a narrow, named exception, not the default mechanism.
- ⚠️ `common/features.ts` is Docmost's own upstream EE `Feature` enum (SSO/MFA/SCIM), backed by a stubbed `LicenseCheckService` that currently grants everything — **not** the internal/public edition flag infra. That's the separate `WorkionFeature`/entitlement mechanism (see "Entitlement / Edition Gating" under Implemented Custom Features). Don't conflate the two.
- Public-edition tier limits (clients per workspace, users, domains) will be enforced in-app. Limits/pricing are **unvalidated** — treat any numbers as placeholders.

## Pre-Launch Gate: Licensing Audit (blocking)

Required before any commercial/AppSumo distribution. This is a legal/architecture requirement, not cleanup:

- [ ] Audit Docmost Core AGPL obligations for our distribution model (AppSumo buyers = distribution).
- [ ] Verify no Enterprise Edition (`apps/ee/`) code or features are distributed in the public build.
- [ ] Audit the whiteboard component's license.
- [ ] Keep proprietary functionality architecturally separable.
- [ ] Confirm AppSumo redistribution/rights requirements can be satisfied.

---

## Development Methodology

**Spec → Approve → Implement (step by step, not in chunks)**

1. **Write a spec** for the feature: what it does, data model changes, API contract, UI behaviour, edge cases.
2. **Get approval** before writing a single line of implementation.
3. **Implement incrementally**: one slice at a time (migration → service → controller → frontend).
4. **Write unit tests first** (TDD): red → green → refactor.
5. **Update this file** if the feature changes architecture or adds new black-box zones.

Never implement more than one approved feature at once. Never skip the spec step.

**Spec file location.** Every spec is its own markdown doc under `docs/specs/`, in one of three subfolders by status:

```
docs/specs/draft/     # written, not yet approved
docs/specs/ongoing/   # approved, implementation in progress (or partially done — some slices remain)
docs/specs/done/      # fully implemented
```

Move the file (`git mv`) to the matching folder as its status changes — don't just edit a status line while it sits in the wrong folder. Update any links to it (in this file, other specs, or code comments) when it moves.

**Implemented (2026-08-22):** [Cloud Email-First Authentication](docs/specs/done/CLOUD_EMAIL_FIRST_AUTH_SPEC.md) — cloud email/password sign-in resolves the tenant server-side and uses the existing exchange-token handoff.

**Detail lives in the spec, not here.** Once a feature has a spec doc, that doc is the source of truth for its design and status — update it there, including new findings, gaps, or scope changes discovered during implementation. An entry under "Implemented Custom Features" below points to its spec (name + link + one-line summary) instead of restating the spec's content. This is what lets this file — and anyone reading it — always know which spec is active for a given feature without cross-checking two descriptions that can drift apart. Features shipped without ever getting a spec doc keep their full description here until one exists.

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

**Public billing deployment boundary (2026-08-23):** `workionlive.gameloops.io` is the public Cloud/tenant deployment and the sole destination for Lemon Squeezy checkout/webhook configuration. `workion.gameloops.io` remains the internal Gameloops deployment. Never deploy, configure billing, or otherwise alter the internal deployment without explicit user approval.

**Upstash abandoned** — BullMQ exhausted the free tier in ~10 days. Now using local Redis.

**Neon abandoned (2026-06-13)** — free-tier egress hit 81%. Migrated to a local Postgres container on the VPS. Dump/restore via `pg_dump -Fc --no-owner --no-acl` / `pg_restore --clean --if-exists`. No `sslmode`/pgbouncer params — internal Docker network, plain TCP. Daily backups to R2 via `backup.sh` (cron 2 AM). Postgres 18+ needs its volume mounted at `/var/lib/postgresql` (not `.../data`) — it creates the versioned subdirectory itself.

**Postgres runs as a standalone infra stack (2026-06-13)** — independent of Workion's compose project, at `/opt/infra/docker-compose.yml`, own volume `infra-postgres-data`, own network `infra-net`. Workion's `app` service joins `infra-net` as external and reaches Postgres via the `postgres` service-name DNS alias — no `DATABASE_URL` change needed. `backup.sh` targets `infra-postgres-1` directly via `docker exec` (not `docker compose exec`). New app database: `docker exec -it infra-postgres-1 psql -U docmost` → `CREATE DATABASE … / CREATE USER … / GRANT …`.

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

How blog publishing behaves in production, and the runbook for pointing a client's domain at their space's blog. `BlogRenderController`/`BlogSeoController` resolve which space to serve purely from the request's `Host` header, looked up against `spaces.settings.blog.domain` in the DB at request time — no code path needs redeploying per domain.

**Primary domain (`workion.gameloops.io`) — zero setup.** Every space's published posts (needs a `shares` row, i.e. actually published, not just saved settings) are automatically reachable at `https://workion.gameloops.io/blog/:slug`, `/blog/sitemap.xml`, `/blog/rss.xml`. `basePath` is ignored here regardless of whether it's set — it only applies once a custom domain is configured for that space.

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

**Local testing (no DNS/Caddy needed):** add a dotted hosts-file entry (e.g. `blog.local` — single-label names like `localhost` are rejected by the domain validator), set it as the space's Blog domain, and hit the backend directly on its own port (`http://blog.local:3000/...`), not the Vite dev server on 5173. `getBlogDomainOrigin()` (`lib/config.ts`) builds the live-link URL shown in the settings modal from `SERVER_URL` in dev / a bare `https://` origin in prod.

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
| ------------------------ | ------------------------------------ |
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

| Path                    | Why hands-off                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `collaboration/`        | Hocuspocus engine — additive touches only                                                        |
| `apps/editor-ext/`      | TipTap extensions                                                                                 |
| `apps/ee/`              | Enterprise Edition — conditionally loaded                                                        |
| `integrations/storage/` | Use `StorageService`, don't re-implement                                                          |
| `integrations/mail/`    | Use `MailModule`, don't touch internals                                                           |
| `integrations/queue/`   | Add new jobs/queues, don't change infra                                                           |
| `integrations/export/`  | HTML/Markdown/DOCX export — extend via `ExportService`; `docx-utils.ts` for DOCX preprocessing   |
| `integrations/import/`  | MD/HTML/DOCX import — extend via `ImportService`                                                  |

---

## Client Module Map

### Work areas

| Path                           | What it is                       |
| ------------------------------- | --------------------------------- |
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
| ------------------------- | -------------------- |
| `features/editor/`       | TipTap integration |
| `features/transclusion/` | Page embedding     |
| `features/websocket/`    | Real-time sync     |

---

## Signup Behaviour

`GET /api/auth/setup-config` always returns `{ allowSignup: true }` — that's just a UI signal to show the sign-up link, not a guarantee. The actual workspace-creation endpoint, `POST /auth/setup`, is gated by `SetupGuard` (`core/auth/guards/setup.guard.ts`):

```ts
async canActivate(): Promise<boolean> {
  if (this.environmentService.isCloud()) return false;
  const count = await this.workspaceRepo.count();
  return count === 0;
}
```

This succeeds only once, ever, per deployment — the very first workspace. Once Gameloops exists, `/auth/setup` is permanently blocked (and unconditionally blocked in `isCloud()` mode regardless of count). See "Multi-Tenancy Status" for why self-hosted Workion can't create a second workspace today.

- **Frontend**: `/` redirects to `/setup/register`; login and signup pages cross-link. These render regardless of whether signup will actually succeed — misleading beyond the first workspace.
- Invitations (joining an *existing* workspace via `invite-link/*` or `workspace_invitations`) and login always work — only *creating* a new workspace is limited to the first one.

---

## Multi-Tenancy Status (read before any "separate paid workspace" work)

Self-hosted Workion, as built, is architecturally single-workspace — not a config flag, real implementation work was required. Two independent blockers, both still true of the codebase today:

1. **No way to create a second workspace.** `POST /auth/setup` is a one-time bootstrap (see "Signup Behaviour"). Docmost's own second-workspace flow (`apps/client/src/ee/pages/create-workspace.tsx`, `/create` and `/select` routes, `POST /workspace/create`) has no backend in this repo — **`apps/server/src/ee/` doesn't exist here** — the endpoint would 404.
2. **No per-request tenant routing.** `DomainMiddleware` (`common/middlewares/domain.middleware.ts`) resolves the workspace for every request. In self-hosted mode (`CLOUD` unset — how Gameloops runs), it always calls `workspaceRepo.findFirst()` regardless of how many workspace rows exist. Hostname-based routing (`findByHostname`) only exists in the `isCloud()` branch.

**Spec (source of truth):** `docs/specs/done/MULTI_TENANCY_SPEC.md` — Done. Architecture decision, all four implementation slices, the live second deployment (`https://workionlive.gameloops.io`), bugs found and fixed, known follow-ups, and the git-push-access gotcha are all recorded there, not here.

---

## Implemented Custom Features

### Client Entity

Agency Client (a company Workion does work for, spanning one or more Spaces) — see "Next Major Direction: Client Layer" for product context. A Space **is** the unit of client work (a "project") — there is no separate Project entity; a Client simply links to one or more Spaces.

**Decision (2026-08-23): the Project entity was removed.** It duplicated what a linked Space already represents, so `core/client/project.controller.ts`/`ProjectService`/`ProjectRepo`, the `projects` table, and the client-detail "Projects" section were all deleted (migration `20260823T140000-drop-projects.ts`). Deliverables continue to live as a Space's pages, unchanged.

**Spec (source of truth):** `docs/specs/done/CLIENT_ENTITY_SPEC.md` (entity design, all 5 slices done) and `docs/specs/done/CLIENT_LAYER_CLEANUP_SPEC.md` (follow-up: delete/remove UI, showing a Space's linked Client in the Space UX itself, and closing the Blog entitlement leak found during the same review).

Backend: `core/client/` (`ClientController`, `ClientService`), `database/repos/client/`, tables `clients`/`client_spaces`. No new CASL tier — reuses the existing `Space` ability (`Manage Page` required to create/edit/delete). `GET /clients/by-space/:spaceId` resolves the Client (if any) linked to a given Space. Delete is soft (`archive()`/`deleted_at`), matching the rest of the schema. Client has no `WorkionFeature` entry — unlike Blog, it's intentionally available to every workspace/plan (guardrail comment in `entitlement.ts`).

Frontend: top-level "Clients" sidebar entry (`components/layouts/global/global-sidebar.tsx`) and `pages/clients/*` (list, client detail) — a first-class vertical alongside Spaces, not nested inside one. A Space linked to a Client shows it as a link in Space Settings → General and as a subtitle in the Space sidebar (`useClientBySpaceQuery`). Delete actions on the Client detail page use the standard `modals.openConfirmModal` pattern.

### Space Invite Links (Guest Access)

Shareable invite links for spaces. Backend: `core/space/services/space-invite-link.service.ts`, controller at `spaces/invite-links/*`, `space_invite_links` table (token, spaceRole, expiresAt, maxUses, useCount). Auth endpoints: `GET /auth/invite-link/:token` (public info), `POST /auth/invite-link/signup` (new guest account), `POST /auth/invite-link/join` (existing user). `spaceRole` is `reader | commenter | writer` — `commenter` (read + comment, no Settings access) is the typical guest role; joining always adds the user to the workspace as `UserRole.GUEST`. "Space Settings" UI is hidden when `spaceAbility.cannot(Read, Settings)`. Frontend: `SpaceInviteLinks` in space settings, `InviteLinkPage` at `/invite/:token`.

**Comment permission system:** `SpaceRole.COMMENTER` added alongside reader/writer/admin, plus `PagePermissionRole.COMMENTER` for page-level overrides. Only admin/writer/commenter get CASL `can(Create, Comment)`; readers cannot comment. `validateCanComment`: unrestricted pages need the CASL ability, restricted pages need a commenter/writer page-level role. `page.permissions.canComment` gates the inline comment dialog, comment sidebar, reply editors, and `@mention` on the frontend. The `Share` header option is hidden for workspace guests.

### AI Chat (BYOK via OpenRouter)

OpenRouter key stored per workspace in `workspace_ai_config` (encrypted). Backend: `core/ai-chat/` — streaming chat, page content injection, auto-title. Frontend: slide-over panel with thread list + model selector; key UI in workspace settings. All AI routes through OpenRouter only — no direct Anthropic/OpenAI calls.

### Kanban Board Page

`kanban` page type. Backend: `core/kanban/`, tables `kanban_tasks`/`kanban_columns`. Frontend: `features/kanban/`, Atlaskit pragmatic DnD; assignees, due dates, priority. Realtime: WS events `kanbanCardMoved`/`kanbanColumnMoved` on `page-${pageId}` room, filtered by `userId` to skip self. Milestone badge turns red (overdue) / amber (today).

### Entitlement / Edition Gating — Workspace Module Config

Workspace-level plan/module gating, independent of Docmost's own upstream EE `Feature` system (untouched, see "Editions"). Core: `apps/server/src/common/entitlement/`.

**Spec (source of truth):** `docs/specs/done/WORKSPACE_MODULE_CONFIG_SPEC.md` (the module-config mechanism, Done) and `docs/specs/ongoing/EDITION_ENTITLEMENT_SPEC.md` (entitlement-resolution design; Slices 3–4 blocked on the Client entity). Read those before touching this system — don't rely on a summary here.

**Only Blog is actually wired to this system** — Kanban, AI Chat, Page Templates, DOCX import/export, and the HTML Artifact block are all ungated/always-on. Check `PLAN_FEATURES` (in the spec) before assuming a module differs by plan.

### Blog Publishing Platform (internal-only)

Not part of the planned public build. `blog` is a page type (`core/blog/`) with per-post metadata and a per-space custom hostname.

**Spec (source of truth):** `docs/specs/ongoing/BLOG_MASTER_SPEC.md` — publish flow, public JSON API, SSR/custom-domain rendering, sitemap/RSS/robots, entitlement gating and known gaps (Addendum A), custom fields (Addendum B). Also see `docs/specs/done/BLOG_STABLE_ATTACHMENT_URLS_SPEC.md` (stable image URLs) and "Blog — Live Custom Domain Setup" above for the production DNS/Caddy runbook.

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

`POST /comments/resolve` → `CommentService.resolve()` — sets `resolvedAt`/`resolvedById`, emits `commentResolved` WS event, queues notification. `use-query-subscription.ts` shows a toast on `commentCreated` from other users (filtered via `queryClient.getQueryData(["currentUser"])`).

### Logo

SVG at `apps/client/src/assets/logo-workion.svg`, imported in `auth-layout.tsx` as a JS module (Vite content-hashes it). To update: replace the SVG and redeploy.

### Sidebar Inline Page Rename — DONE

Sidebar `...` menu "Rename" (canEdit only) swaps the title `<span>` for an auto-focused `<input>`. Enter/blur saves via existing `handleRename()` (skips API if unchanged/empty); Escape reverts. Files: `space-tree-node-menu.tsx`, `space-tree-row.tsx`, `tree.module.css`.

### Unread Page Notification Badge — DONE

Blue count badge on sidebar page items for pages with unread notifications directed at the current user; clears when the user navigates to the page. DB: `page_reads` table (migration `20260607T000000-page-reads.ts`). Backend: `PageReadsRepo` (`upsert`, `getUnreadCounts`, `getUnreadCount`); `NotificationService.create()` emits `pageUnreadCountChanged` after inserting a page-scoped notification; `POST /pages/unread-counts` and `POST /pages/mark-read`. Frontend: `pageUnreadCountsAtom` (Jotai), initial fetch + WS subscription in `use-notification-socket.ts`, badge in `SpaceTreeRow`, `useMarkPageRead` called in `PageContent` on page ID change.

### Toggle Heading 1 / 2 / 3 — DONE

Collapsible headings (H1–H3) where the heading text is the toggle trigger, similar to Notion's toggle headings. Extension: `packages/editor-ext/src/lib/toggle-heading/` (`ToggleHeading` wrapper node with `level`/`open` attrs, `ToggleHeadingTitle`, `ToggleHeadingContent`). Commands: `setToggleHeading`, `unsetToggleHeading`, `toggleToggleHeading`. Input rules `#> `/`##> `/`###> ` for H1/H2/H3. Wired into the slash menu, turn-into/bubble menus, and level-aware placeholder text. **No keyboard shortcut** — would conflict with StarterKit's `Mod-Alt-1/2/3` on plain headings. `Enter` in the title opens the toggle and moves into content; `Backspace` at title start unsets. `open` state is local-only, not synced across users (same as toggle blocks). CSS: `features/editor/styles/toggle-heading.css`.

### DOCX Export & Import — DONE

Single-page export, full import, via `mammoth`/`html-to-docx`/`katex`. No round-trip fidelity guarantee — DOCX is an exchange format.

- Export: `pageJson → jsonToHtml() → preprocessHtmlForDocx() → html-to-docx → Buffer`. Preprocessing (`integrations/export/docx-utils.ts`, cheerio-based) inlines attachment images as base64 data URIs, converts math via KaTeX HTML, turns callouts into styled blockquotes, unwraps columns and attachment nodes, strips subpages/transclusion nodes and `data-*` attrs.
- `ExportFormat.Docx` added to both `ExportPageDto`/`ExportSharedPageDto`; `ExportSpaceDto` intentionally excludes docx (no ZIP multi-page support). `exportPage()`/`exportPages()` treat docx as always single-page.
- Import: `processDocx()` calls `mammoth.convertToHtml({ buffer }, { includeDefaultStyleMap: true })` → `processHTML()` directly, replacing the old EE dynamic-require.
- Frontend: "Word (.docx)" in the format selector of `ExportModal` (page export only) and `ShareExportModal`; subpage/attachment toggles hidden when docx is selected.

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

## Next Major Direction: Client Layer

⚠️ **"Client Layer" = agency client** — a company Gameloops does work for, nested under the existing Space/permission model. This is a *different concept* from **a paid Workion workspace/tenant** (see "Multi-Tenancy Status"). A 2026-08-21 mix-up built a full Client-entity MVP in answer to what was actually a multi-tenant-workspace question — reverted the same session once the misunderstanding surfaced. Don't conflate the two.

The main product gap: a client used to be just a Space + guest users. Priority order (from the AppSumo handoff):

1. **Client entity** (critical) — **Done** (2026-08-23). `docs/specs/done/CLIENT_ENTITY_SPEC.md` — `clients`/`client_spaces`/`projects` tables, one Client can span multiple Spaces, writes gated by the existing `Space` CASL ability. See "Client & Project Entities" under Implemented Custom Features.
2. **Projects** (critical) — **Done**, shipped as part of #1 (status pipeline: `planning → in_progress → in_review → approved → delivered`, plus `archived`). **Deliverables** as a separate entity is still not started — a project's deliverables remain its Space's pages, by design (see the Client Entity spec's scope).
3. **Branded client portal** (critical) — not started. **Decision (2026-08):** a filtered view over existing Spaces/permissions, not a separate frontend surface — reuses the Space/CASL model as a scoped, re-skinned view rather than duplicating permission/display logic.
4. **Approval / request flow** (high) — needs review → changes requested → approved → delivered → published. Not started.
5. **Agency-focused AI** (high) — brief→tasks, feedback→action items, status summaries, client-context drafting. No generic autonomous agents before this. Not started.

The edition/entitlement architecture (`docs/specs/ongoing/EDITION_ENTITLEMENT_SPEC.md`, Slices 1–2, done, applied to the blog module) is unrelated to this reverted work, but it's what real multi-tenancy will also need once workspace resolution itself is fixed. Slice 3 (tier limits) is now unblocked — the Client entity it depends on exists — but still not started. Client/Project themselves have no `WorkionFeature` entry and are intentionally ungated for every workspace/plan (guardrail comment in `entitlement.ts`); Slice 3 should add a count *limit*, not a feature *gate*, on `WorkionPlan.INTERNAL`.

One spec, one feature at a time, per the methodology — do not batch client-layer work without its own spec.

---

## Pending Features (Approved Specs)

**Active specs:**

- [docs/specs/ongoing/CLIENT_MEMBER_INVITES_SPEC.md](docs/specs/ongoing/CLIENT_MEMBER_INVITES_SPEC.md) — one-use Client member invites that grant commenter access across every Client-linked Space.
- [docs/specs/ongoing/BILLING_BACKEND_SPEC.md](docs/specs/ongoing/BILLING_BACKEND_SPEC.md) — Lemon Squeezy checkout, signed webhooks, portal, `/pricing`, and transaction-safe tenant Space limits. Solo Founder is $9/month (first three payments $5 with `FOUNDER5`); Startup is $19/month (first three payments $9 with `STARTUP9`). Implementation is locally verified (2026-08-23); the only remaining gate is a configured Lemon test-mode smoke test on `workionlive`. Live selling remains blocked until Lemon Squeezy identity verification completes.

**Active spec:** [docs/specs/ongoing/BLOG_MASTER_SPEC.md](docs/specs/ongoing/BLOG_MASTER_SPEC.md) — Blog Publishing Platform. Specs 1–5 and 7–9 are Done; **Spec 6** (browser smoke test + real custom-domain/DNS/Caddy verification) is still "In progress" — the documented step-by-step procedure against a custom domain + basePath hasn't been formally run yet, even though the blog feature is in active use on the primary domain.

**Done (2026-07-29 batch), specs kept for reference:** four specs written from a list of reported issues/requests, each grounded in a research pass over the actual code (file:line references, root causes verified against source). All four are now implemented — see each file's status line for the landing commit(s).

- [docs/specs/done/KANBAN_IMPROVEMENTS_SPEC.md](docs/specs/done/KANBAN_IMPROVEMENTS_SPEC.md) — 5 independent Kanban fixes: GIF image support (5MB cap), a redundant-WS-broadcast cleanup that's the likely root cause of non-instant card/column move sync, live cursor presence on the board, title/description autosave in the card modal, and a Mantine `ScrollArea` `type="hover"` fix for the missing scrollbar in the card detail view.
- [docs/specs/done/SPACE_LIST_CACHING_SPEC.md](docs/specs/done/SPACE_LIST_CACHING_SPEC.md) — brings the space list in line with the `withCache`/`CacheKey` + invalidate-on-write pattern already used for user/space/workspace/page lookups.
- [docs/specs/done/TOGGLE_BLOCK_TURNINTO_FIX_SPEC.md](docs/specs/done/TOGGLE_BLOCK_TURNINTO_FIX_SPEC.md) — fixes "Turn into" being unreachable for blocks inside a toggle block/toggle heading. Root cause was the global drag-handle's hit-testing never registering toggle content nodes in `customNodes`.
- [docs/specs/done/BLOG_STABLE_ATTACHMENT_URLS_SPEC.md](docs/specs/done/BLOG_STABLE_ATTACHMENT_URLS_SPEC.md) — fixes blog post images going dead in externally-cached HTML. Replaced expiring `/files/public/...?jwt=` attachment URLs with a stable `/files/blog/:fileId/:fileName` route whose access is checked live against publish state.

**Done (2026-08-23):**

- [docs/specs/done/CLIENT_MEMBER_MANAGEMENT_SPEC.md](docs/specs/done/CLIENT_MEMBER_MANAGEMENT_SPEC.md) — lets agency users associate existing Space members with the parent Client without changing their Space role.
- [docs/specs/done/CLIENT_ENTITY_SPEC.md](docs/specs/done/CLIENT_ENTITY_SPEC.md) — Client/Project entities (Clients spanning multiple Spaces, Projects with a status pipeline). All 5 slices complete and verified live on `workion`. See "Client & Project Entities" under Implemented Custom Features.
- [docs/specs/done/CLIENT_CONTACTS_SPEC.md](docs/specs/done/CLIENT_CONTACTS_SPEC.md) — Client contacts, including manual agency contacts and automatic portal-user links when guests join Client-linked Spaces.
- [docs/specs/done/CLIENT_LAYER_CLEANUP_SPEC.md](docs/specs/done/CLIENT_LAYER_CLEANUP_SPEC.md) — 4-item punch list found while reviewing the above: the Blog tab leaking past entitlement on `workionlive` (frontend never checked `WorkionFeature.BLOG`, and the settings-write endpoint had no guard at all), a Space giving no indication it belongs to a Client, no delete/remove UI for Client or Project (backend soft-delete already existed), and confirming Client/Project ships live + stays ungated on `workion`.

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
