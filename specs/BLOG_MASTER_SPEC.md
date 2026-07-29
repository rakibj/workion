# Blog Publishing Platform — Master Spec

> **This is the active spec.** Any session working on the blog feature should read this file first, find the first spec below that isn't `Done`, and treat only that spec's scope as the session's target. Don't jump ahead to a later spec even if it looks quick — each one assumes the previous ones are actually merged, not just planned. Update the **Progress Tracker** and that spec's **Handover** line before ending a session, even if the spec isn't finished.

## Goal

Turn Workion (this Docmost fork) into a headless-capable blog backend:

- Write posts in Workion using the existing editor (a new `blog` page type).
- Publish a post (reuses the existing `shares` mechanism as the publish signal).
- Serve it three ways: (a) a public JSON API for pulling into an external app (e.g. Next.js), (b) real server-rendered HTML on a custom domain mapped to a space (e.g. `rakibjahan.com/make-a-game`), (c) the same content at `workion.gameloops.io/blog/make-a-game` on the primary domain.
- SEO settings per post (meta title/description, OG/Twitter, canonical, robots) plus sitemap/RSS/robots.txt and render caching, so the technical-SEO floor is solid. Content quality and backlinks are still on you — no spec here fixes that.

Full design rationale lives in conversation history; this doc only carries what's needed to implement.

## Proposed implementation batch — Publish-to-render foundation

**Status:** Done (2026-07-29).

This batch deliberately combines the parts of the blog platform that form one usable publishing path, while keeping crawl-surface extras (sitemap, RSS, robots, and caching) for the next batch:

1. **Finish Spec 2 — Publish workflow + admin UI.** Add the missing automated coverage for the authenticated workflow and finish the OG-image attachment selection in the existing settings modal. This establishes an editor-owned, permission-checked publish state.
2. **Spec 3 — Public Blog JSON API.** Implement a single reusable public-read service which resolves a space by exactly one of `domain` or `spaceId`, returns published unrestricted posts only, and renders post content to HTML. The controller remains a thin JSON adapter.
3. **Spec 4 — Custom-domain and `/blog/:slug` SSR.** Reuse that public-read service in a non-`/api` render controller. It handles custom-domain archive/post routes and primary-domain `/blog` routes, while every unrecognised route continues to the SPA shell.

**Why these belong together:** they share the same definition of a publishable post (blog page + settings + share + no restricted ancestor), domain resolution, content rendering, and SEO metadata. Implementing them as one vertical slice avoids two competing public-read queries and makes the publishing UI immediately verifiable through both JSON and HTML outputs.

**Explicit boundary:** Spec 5 stays separate. XML feed generation and cache behavior need their own content-type, invalidation, and cache-hit tests, so combining them would reduce the confidence of this batch.

**Acceptance checks for the batch:** authenticated publish/unpublish remains permission-checked; the public list and detail API reject invalid selectors and hide drafts/restricted posts as 404; SSR emits escaped metadata, canonical/robots/JSON-LD tags, and never intercepts unrelated primary-domain SPA routes.

**Completion:** Specs 2–4 provide the publishing, public JSON, and SSR path. Spec 5 adds domain-resolved sitemap, RSS, and robots routes, plus versioned cache keys for rendered posts and sitemaps. The server build and focused tests pass. Browser smoke testing and production-domain verification remain before release.

## Progress Tracker

| #   | Spec                                          | Status      | Last session | Handover                                                                                                                                           |
| --- | --------------------------------------------- | ----------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Data model — blog page type + settings schema | Done        | 2026-07-28   | Migration, repository, settings service, and unit tests added.                                                                                     |
| 2   | Publish workflow + admin UI                   | Done        | 2026-07-29   | Added an OG-image upload control to the settings modal; the authenticated workflow was already present.                                           |
| 3   | Public Blog JSON API                          | Done        | 2026-07-29   | Public-read service and JSON endpoints added, with selector, visibility, and pagination coverage.                                                  |
| 4   | Custom-domain + `/blog/:slug` SSR pages       | Done        | 2026-07-29   | Custom-domain and primary-domain rendering added; unrelated primary-domain routes fall through to the SPA.                                         |
| 5   | Sitemap, RSS, robots.txt, render caching      | Done        | 2026-07-29   | Domain-resolved sitemap, RSS, and robots routes added; post and sitemap output use versioned cache keys with focused coverage.                     |
| 6   | Browser smoke testing + production domain verification | In progress | 2026-07-29 | Configurable custom-domain paths and focused route coverage are implemented; run the documented browser procedure after the local stack/DNS/Caddy are available. |
| 7   | Public attachment access for blog images (body + OG)   | Done        | 2026-07-29 | Shared public-content preparation now rewrites inline attachments, strips comments, and exposes signed OG-image URLs; SSR cache is shorter than token lifetime. |
| 8   | Full SEO/meta package on the public API                 | Done        | 2026-07-29 | Public posts now include a ready-to-render meta package with canonical, robots, OG/Twitter values, and BlogPosting JSON-LD.                         |
| 9   | Selector-based sitemap/RSS/robots (no DNS/Caddy needed) | Done        | 2026-07-29 | Public selector feed routes accept `domain` or `spaceId` plus optional `baseUrl`; focused tests and server build pass.                               |

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

---

## Spec 6 — Browser smoke testing + customizable public URLs

**Depends on:** Spec 1–5.

**What it does:** Confirms the complete publishing path in a real browser and makes the public URL structure editor-configurable.

- Blog post slugs remain editable in the Blog post settings modal; saving validates uniqueness within the space and updates the public URL immediately.
- Space Blog settings support a custom hostname plus an optional one-segment base path, such as `rakibjahan.com` with `/blogs`, producing `https://rakibjahan.com/blogs/<slug>`. An empty path publishes at the hostname root.
- Browser smoke tests must cover publishing, editing a slug, saving the hostname/path, primary-domain `/blog` routing, custom-domain archive/post routes, SPA fallback, metadata, sitemap, RSS, and robots.

**Definition of done:** a browser test or documented manual run proves `rakibjahan.com/blogs/<editable-slug>` renders after DNS/Caddy setup, and changing the slug changes the rendered URL without exposing the old post.

### Smoke-test procedure

**Prerequisites:** start the local Docker stack, build the client and server, and map the configured custom hostname to the local app through a hosts-file entry or DNS. Create a blog post in a space with `domain = blog.local.test` and `basePath = /blogs`.

1. In the authenticated app, create a **Blog Post**, save slug `first-post`, and publish it. Confirm the settings modal shows **Published**.
2. Change the slug to `renamed-post`, save, then confirm the old custom-domain URL returns no post while `https://blog.local.test/blogs/renamed-post` renders the post.
3. Confirm `https://blog.local.test/blogs` renders the archive and links to `/blogs/renamed-post`.
4. Confirm the post source includes its title, canonical URL, robots directive, Open Graph/Twitter metadata, and `BlogPosting` JSON-LD.
5. Confirm `https://blog.local.test/blogs/sitemap.xml`, `/blogs/rss.xml`, and `/blogs/robots.txt` return their expected XML/text content; a `robotsIndex: false` post must be absent from the sitemap.
6. Confirm `https://<primary-host>/blog/renamed-post` renders the same post and `https://<primary-host>/an-unrelated-app-route` still receives the SPA shell.
7. Clear the space Blog path, save, and confirm the archive/feed routes move to the custom-domain root (`/`, `/sitemap.xml`, `/rss.xml`, `/robots.txt`) while `/blogs/...` no longer exposes content.

Record the hostname, post ID, and the result of each check in the release handover. Do not mark Spec 6 done until this procedure passes against the deployed DNS/Caddy configuration.

---

## Spec 7 — Public attachment access for blog images (body + OG)

**Depends on:** Spec 3, 4.

**What it does:** Fixes a gap not covered by Specs 1–6: attachment images referenced by a published blog post — both inline body images and the OG image — currently resolve to `/files/:fileId/:fileName`, which requires an authenticated session and page-view permission (`attachment.controller.ts:167`). `BlogPublicService.getPost()`/`listPosts()` call `jsonToHtml(post.content)` directly with no rewriting, and `serializePost()` returns `ogImageAttachmentId` as a bare UUID with no URL at all. Neither is fetchable by an anonymous reader, so images are currently broken both on Workion's own SSR pages (Spec 4) and for any headless consumer.

**Backend:**

- Reuse the existing `TokenService.generateAttachmentToken({ attachmentId, pageId, workspaceId })` + `/files/public/:fileId/:fileName?jwt=` route (already built for `shares`, in `share.service.ts:475` `prepareContentForShare`) — same threat model, same token shape, no new attachment-serving route needed.
- `BlogPublicService`: before calling `jsonToHtml`, run `post.content` through the same content-preparation step `ShareService.prepareContentForShare` uses (rewrite attachment node `src`/`url` to the public token form, strip comment marks), scoped to the post's `pageId`. Extract that private helper into a shared utility both services call (e.g. `attachment-share.util.ts`) rather than writing a second implementation that can drift from the first.
- `serializePost()` adds `ogImageUrl: string | null` — when `ogImageAttachmentId` is set and the attachment record still exists, mint the same public attachment token and build the absolute `/files/public/:id/:fileName?jwt=...` URL. Keep `ogImageAttachmentId` for backward compatibility; `ogImageUrl` is what consumers should render.
- Tokens are minted per-request (short-lived, same as the existing share mechanism) — cached HTML/JSON responses (Spec 5's `with-cache.ts` wrapping) will embed whatever token was live at cache-write time, so cache TTL must stay shorter than the attachment token's expiry. Check `TokenService`'s attachment-token TTL against the blog cache TTLs when implementing.

**Edge cases:** post body references a deleted attachment → renders whatever broken `src` results, no special handling (same as today, out of scope to fix). `ogImageAttachmentId` set but the attachment record is gone → `ogImageUrl` comes back `null`, not a token for a nonexistent file.

**Tests:** unit test that `getPost`/`listPosts` output HTML with rewritten `src` attributes for a post containing an attachment node; unit test that `ogImageUrl` is `null` with no OG image set, `null` when the attachment record is missing, and a well-formed public URL otherwise.

**Definition of done:** a blog post with an inline image and an OG image, fetched anonymously (no cookies/session) via `/api/public/blog/posts/:slug`, has an `html` field whose `<img>` tags resolve with a plain `curl`, and a non-null `ogImageUrl` that also resolves with a plain `curl`.

**Out of scope:** image optimization/resizing, CDN caching of file bytes (already handled by `StorageService`), non-blog public content (page shares already work via `prepareContentForShare`).

---

## Spec 8 — Full SEO/meta package on the public API

**Depends on:** Spec 3, 7.

**What it does:** Bundles everything a headless frontend needs to render `<head>` correctly with zero SEO logic of its own — closes the gap between what `BlogRenderController` computes internally for its own pages (Spec 4) and what the public JSON API currently exposes (Spec 3), so both paths produce identical values from one shared computation instead of two hand-maintained ones.

**Backend:**

- Extract the fallback/composition logic currently inlined in `blog-render.controller.ts`'s `renderPost()`/`document()` (title fallback `metaTitle || title`, canonical fallback `canonicalUrl || origin+pathPrefix+slug`, robots string from two booleans, `BlogPosting` JSON-LD object) into a shared helper (e.g. `blog-meta.util.ts`) used by both `BlogRenderController` and `BlogPublicService.serializePost()`. This is a refactor for consistency, not new business logic — Spec 4's rendered output must not change.
- `serializePost()` gains a `meta` object: `{ title, description, canonical, robots, ogTitle, ogDescription, ogImage, twitterCard, structuredData }`. `title`/`description` apply the existing `metaTitle || title` / `metaDescription` fallback. `canonical` is never null — falls back to the resolved space's `domain`+`basePath` (or the primary app domain + `/blog/`) + slug, the same formula `BlogRenderController` already uses. Requires threading the resolved `space` down into `serializePost` (not currently available there — `getPost`/`listPosts`/`getPrimaryPost`/`listPrimaryPosts` all resolve `space` first and can pass it through).
- `structuredData` is the same `BlogPosting` JSON-LD object Spec 4 builds inline, returned as a plain object (not pre-stringified) — the client embeds it in their own `<script type="application/ld+json">{JSON.stringify(...)}</script>`.
- `listPosts` may omit the heavier `meta.structuredData`/`meta.ogImage` fields if list-payload size becomes a concern — default to including them since list responses are already capped at `limit=100`.

**Edge cases:** post's space has no `settings.blog.domain` configured (primary-domain-only post) → canonical falls back to `APP_URL` + `/blog/<slug>`, matching what `BlogRenderController` already does for primary-domain requests — this holds even for spaces that will only ever be consumed headlessly and never rendered by Workion.

**Tests:** `meta.canonical` fallback under three cases (custom domain configured, no domain configured, explicit `canonicalUrl` set on the post overrides both); `meta.robots` string composition from the four boolean combinations; `meta.structuredData` shape.

**Definition of done:** a client can take `response.meta` verbatim and populate a Next.js `<Head>` (or equivalent) — title, meta description, canonical link, robots meta, OG tags, Twitter card, and JSON-LD script — without computing any fallback or combining any fields themselves.

**Out of scope:** rendering the client's page (that's on their site); AMP or other markup formats; multi-locale meta.

---

## Spec 9 — Selector-based sitemap/RSS/robots (no DNS/Caddy required)

**Depends on:** Spec 5.

**What it does:** Spec 5's `sitemap.xml`/`rss.xml`/`robots.txt` only resolve via the request's `Host` header matching `spaces.settings.blog.domain`, which requires DNS plus a Caddy site block pointed at Workion (see "Blog — Live Custom Domain Setup"). A pure headless setup — the client's own server renders everything and never proxies traffic to Workion — has no `Host` header Workion would recognize. This spec adds the same `?domain=`/`?spaceId=` selector Spec 3's JSON endpoints already use, so a client can fetch fully-formed feed output directly from Workion's API and serve it from their own `/sitemap.xml` etc. with zero XML/RSS templating of their own.

**Backend:**

- New `@Public()` routes alongside the existing domain-resolved ones (or the same handlers, made selector-aware): `GET /api/public/blog/sitemap.xml?domain=&spaceId=&baseUrl=`, `/rss.xml`, `/robots.txt`.
- `baseUrl` — the absolute origin+path prefix used to build `<loc>`/`<link>` entries. Required when the resolved space has no `settings.blog.domain` configured; optional (and overriding) otherwise — Workion has no other way to know the client's real public URL structure when called this way, unlike the Host-header path, which infers it from the incoming request. Validate as a well-formed absolute URL.
- Reuses Spec 5's existing sitemap/RSS/robots generation logic — a second entry point with an explicit selector + explicit base URL instead of implicit Host-header resolution, not a duplicate implementation.

**Edge cases:** `baseUrl` omitted and no space domain configured → 400 with a clear message (can't build a sitemap without knowing the target site's URL). `domain` selector combined with `baseUrl` → `baseUrl` wins for URL construction; `domain` here only resolves which space's posts to include.

**Tests:** sitemap output uses `baseUrl` instead of request host when provided; 400 when neither a configured domain nor an explicit `baseUrl` is available; existing Host-header-driven Spec 5 behavior unchanged (regression check).

**Definition of done:** `curl 'https://workion.gameloops.io/api/public/blog/sitemap.xml?spaceId=<id>&baseUrl=https://yoursite.com/blog'` returns a ready-to-serve sitemap with `yoursite.com` URLs, and the client's own server can pipe that response verbatim at `yoursite.com/sitemap.xml` with no local generation code.

**Out of scope:** the client's server actually doing the proxying (that's their infra, not Workion's); sitemap index files / multi-sitemap sharding (fine at current post-count scale).
