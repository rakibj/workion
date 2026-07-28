# Blog Publishing Platform — Master Spec

> **This is the active spec.** Any session working on the blog feature should read this file first, find the first spec below that isn't `Done`, and treat only that spec's scope as the session's target. Don't jump ahead to a later spec even if it looks quick — each one assumes the previous ones are actually merged, not just planned. Update the **Progress Tracker** and that spec's **Handover** line before ending a session, even if the spec isn't finished.

## Goal

Turn Workion (this Docmost fork) into a headless-capable blog backend:

- Write posts in Workion using the existing editor (a new `blog` page type).
- Publish a post (reuses the existing `shares` mechanism as the publish signal).
- Serve it three ways: (a) a public JSON API for pulling into an external app (e.g. Next.js), (b) real server-rendered HTML on a custom domain mapped to a space (e.g. `rakibjahan.com/make-a-game`), (c) the same content at `workion.gameloops.io/blog/make-a-game` on the primary domain.
- SEO settings per post (meta title/description, OG/Twitter, canonical, robots) plus sitemap/RSS/robots.txt and render caching, so the technical-SEO floor is solid. Content quality and backlinks are still on you — no spec here fixes that.

Full design rationale lives in conversation history; this doc only carries what's needed to implement.

## Progress Tracker

| #   | Spec                                          | Status      | Last session | Handover                                                                                                                                           |
| --- | --------------------------------------------- | ----------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Data model — blog page type + settings schema | Done        | 2026-07-28   | Migration, repository, settings service, and unit tests added.                                                                                     |
| 2   | Publish workflow + admin UI                   | In progress | 2026-07-28   | Authenticated settings, publish/unpublish, domain endpoint, and initial admin UI are implemented; attachment picker and automated coverage remain. |
| 3   | Public Blog JSON API                          | Not started | —            | Blocked on 1, 2.                                                                                                                                   |
| 4   | Custom-domain + `/blog/:slug` SSR pages       | Not started | —            | Blocked on 1, 2, 3.                                                                                                                                |
| 5   | Sitemap, RSS, robots.txt, render caching      | Not started | —            | Blocked on 3, 4.                                                                                                                                   |

---

## Spec 1 — Data model: blog page type + settings schema

**Depends on:** nothing.

**What it does:** Makes `type: 'blog'` a valid page type and adds storage for per-post SEO/publishing metadata and per-space custom-domain config.

**Data model:**

- `apps/server/src/core/page/services/page.service.ts:11` — `PageType` union: add `'blog'`. **No migration needed on `pages.type`** — it's a plain `varchar` with no DB check constraint (verified: every other type, including `'kanban'`, was added the same way).
- `core/page/dto/create-page.dto.ts` — allow `type: 'blog'`.
- New migration `database/migrations/<ts>-blog-post-settings.ts`, table `blog_post_settings`:
  - `pageId` uuid PK, FK → `pages.id` cascade delete
  - `spaceId` uuid not null (denormalized from `pages.spaceId` at write time, needed for the uniqueness index below without a join)
  - `slug` varchar not null
  - `metaTitle` varchar nullable
  - `metaDescription` text nullable
  - `ogImageAttachmentId` uuid nullable, FK → `attachments.id`
  - `canonicalUrl` varchar nullable
  - `robotsIndex` boolean not null default true
  - `robotsFollow` boolean not null default true
  - `focusKeyword` varchar nullable
  - `createdAt`, `updatedAt` timestamptz
  - unique index on (`spaceId`, `slug`)
- Space settings: no migration — `spaces.settings` is already jsonb. Document the shape `settings.blog = { domain?: string }` and add a merge-write method in `database/repos/space/space.repo.ts` next to the existing `sharing`/`comments` merge methods (same `COALESCE(...) || jsonb_build_object(...)` pattern at `space.repo.ts:137`).
- New repo: `database/repos/blog/blog-post-settings.repo.ts` — `findByPageId`, `upsert`, `findBySlugInSpace(spaceId, slug)`.
- New service: `core/blog/services/blog-post-settings.service.ts` — slugifies from title when no slug given, throws on slug collision within a space (don't silently renumber — surprises users).

**Edge cases:** page deleted → settings row cascade-deletes; page type changed away from `'blog'` → settings row left in place but inert (nothing reads it unless `type === 'blog'`).

**Tests:** Jest, mocked Kysely per `backlink.service.spec.ts` convention — slug generation from title, slug collision throws, `findBySlugInSpace` scoping.

**Definition of done:** migration runs clean; service unit tests green; can create a `type: 'blog'` page and upsert its settings via the service in a test — no controller, no UI yet.

**Out of scope (later specs):** publish flag, any HTTP endpoint, any UI.

---

## Spec 2 — Publish workflow + admin UI

**Depends on:** Spec 1.

**What it does:** Lets a user edit a blog post's SEO settings, publish/unpublish it (publish = create a `shares` row, same table used for regular page sharing), and set a space's blog domain.

**Backend:**

- `core/blog/blog.controller.ts` (authenticated, standard `@UseGuards(JwtAuthGuard)`, no `@Public()`):
  - `POST /blog/posts/:pageId/settings` — upsert `blog_post_settings`. Gate with `PageAccessService.validateCanEdit`.
  - `GET /blog/posts/:pageId/settings`
  - `POST /blog/posts/:pageId/publish` — thin wrapper: require a slug already set, then call the existing `ShareService.createShare({ page, ..., createShareDto: { includeSubPages: false, searchIndexing: dto.robotsIndex } })`. Don't reimplement share logic.
  - `POST /blog/posts/:pageId/unpublish` — look up the page's share via `ShareRepo.findByPageId`, call existing `ShareRepo.deleteShare`.
- `PATCH /spaces/:spaceId/blog-settings` body `{ domain: string | null }` — basic hostname format validation only, no DNS/ownership verification (single-tenant self-hosted, only a space admin can set this on their own space — see architecture discussion, no squatting risk to guard against). Gate with space admin ability via existing CASL space factory.

**Frontend:**

- `apps/client/src/features/blog/` — new feature folder, mirrors `features/kanban/` structure.
- Blog settings panel/drawer, shown when `page.type === 'blog'`: slug, meta title, meta description, OG image (reuse existing attachment upload/picker), robots index/follow toggles, focus keyword field, Publish/Unpublish button + status pill.
- Space settings: new "Blog" tab next to the existing "Sharing" tab — domain input + save.
- Add "Blog Post" as a creatable page type in whatever menu currently offers Document/Kanban.

**Edge cases:** publish attempted with no slug → block with inline validation error, don't hit the API; unpublish when already unpublished → no-op, not an error; space blog domain left blank → fine, later specs just have nothing to resolve against it.

**Definition of done:** create a blog page in the UI, fill SEO fields, publish it, see a "Published" badge; set a space's blog domain from space settings and see it persist.

**Out of scope:** anything public-facing (no unauthenticated route yet).

---

## Spec 3 — Public Blog JSON API (headless)

**Depends on:** Spec 1, 2.

**What it does:** Unauthenticated JSON endpoints for pulling published posts into an external app (Next.js, etc.) — the "bring your own frontend" path.

**Backend:** new `@Public()` controller `core/blog/blog-public.controller.ts`, mounted at `/api/public/blog/*` (same `@Public()` decorator pattern already used on `shares` public routes):

- `GET /api/public/blog/posts?domain=&spaceId=&page=&limit=` — resolve target space by `domain` (against `spaces.settings.blog.domain`) or explicit `spaceId` (fallback for local dev without DNS — require exactly one of the two, 400 if both or neither given). List pages where `type='blog'` AND a `shares` row exists (published), joined with `blog_post_settings`, ordered by `share.createdAt desc`, paginated via existing `PaginationOptions`.
- `GET /api/public/blog/posts/:slug?domain=&spaceId=` — single post: title, slug, body via `jsonToHtml(page.content)` (existing export pipeline, don't reinvent), meta fields from `blog_post_settings`, author display name, `publishedAt` (= `share.createdAt`), `updatedAt`.
- 404 (not 403 — don't leak existence) when: domain doesn't resolve to any space, slug not found, post not published, or `PagePermissionRepo.hasRestrictedAncestor` is true (same guard `ShareService` already applies).

**Edge cases:** draft blog page (`type='blog'`, no share row) → 404 from this API even though it exists in Workion; both/neither of `domain`/`spaceId` provided → 400.

**Tests:** pagination, unpublished-post exclusion, restricted-ancestor exclusion, domain-miss → 404.

**Definition of done:** `curl '.../api/public/blog/posts?domain=rakibjahan.com'` returns only published posts; single-post endpoint returns rendered HTML body + metadata.

**Out of scope:** SSR HTML pages, sitemap/RSS, caching.

---

## Spec 4 — Custom-domain + `/blog/:slug` server-rendered pages

**Depends on:** Spec 1, 2, 3 (reuses its data-fetch logic, different output).

**What it does:** Real crawlable HTML — the SEO-critical piece. Two entry points, one rendering path:

- A domain mapped via `spaces.settings.blog.domain` (e.g. `rakibjahan.com`) → root path is the blog (`/` = archive, `/:slug` = post).
- The primary app domain → only `/blog` and `/blog/:slug` are intercepted; every other path falls through to the normal SPA (untouched).

**Backend:** new `core/blog/blog-render.controller.ts`:

- Resolves `req.headers.host` itself, duplicating the lookup rather than depending on `DomainMiddleware` — reuse the exact workaround already documented in `share-seo.controller.ts:30` (NestJS doesn't apply middleware to paths excluded from the global `/api` prefix, so this controller must sit outside that prefix and do its own host/workspace resolution).
- Renders a small, dependency-free HTML document by hand (own inline CSS, no client JS bundle, no React) containing: `<title>`, canonical `<link>`, meta description, OG/Twitter tags, `<script type="application/ld+json">` (`BlogPosting`, author, `datePublished`, `dateModified`), and the body from `jsonToHtml()`.
- Any path that isn't a recognized blog route falls through to the existing `sendIndex()` SPA-shell behavior — this must never regress normal app routing on the primary domain.

**Ops (not code):** append one Caddy site block per new custom domain to `Caddyfile` (`domain.tld { reverse_proxy app:3000 }`), point DNS (A record to `157.173.120.4`, or CNAME for non-apex) at the VPS, redeploy. Self-hosted workspace resolution already ignores `Host` (`DomainMiddleware`), so no workspace-level change is needed — only the space-by-domain lookup this controller does itself.

**Edge cases:** DNS pointed at the box but `settings.blog.domain` not set for any space → fall through to SPA shell, don't error; post has `robotsIndex:false` → still render, but with `<meta name="robots" content="noindex">` injected and excluded from the sitemap (Spec 5).

**Definition of done:** after DNS+Caddy are wired, `rakibjahan.com/make-a-game` returns full server-rendered HTML with correct meta tags; `workion.gameloops.io/blog/make-a-game` returns equivalent content; every other route on the primary domain still works.

**Out of scope:** sitemap.xml, robots.txt, rss.xml, caching.

---

## Spec 5 — Sitemap, RSS, robots.txt, render caching

**Depends on:** Spec 3, 4.

**What it does:** Rounds out the technical-SEO surface and keeps render cost off the hot path.

**Backend** (same controller as Spec 4, or a sibling `blog-seo.controller.ts` if it gets crowded):

- `GET /sitemap.xml` — all published, `robotsIndex:true` posts for the resolved domain/space, with `lastmod`.
- `GET /robots.txt` — `Allow: /` plus `Sitemap: <resolved-url>/sitemap.xml`.
- `GET /rss.xml` — latest N published posts, RSS 2.0.
- Wrap rendered-HTML and sitemap generation in the existing `common/helpers/with-cache.ts` helper. Cache key includes `updatedAt` (e.g. `blog:render:<pageId>:<updatedAt>`) so a stale entry is simply never addressed again after an edit, instead of needing manual invalidation.

**Edge cases:** zero published posts → sitemap/RSS return valid empty XML, not an error or 404.

**Definition of done:** `sitemap.xml` / `robots.txt` / `rss.xml` resolve correctly per domain; a second request for an unchanged post visibly hits cache (check via timing or a log line — no new metrics system for this).

**Out of scope:** analytics, search-console submission, anything beyond these three files.
