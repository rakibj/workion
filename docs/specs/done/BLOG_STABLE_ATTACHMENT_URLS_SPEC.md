# Stable Blog Attachment URLs — Spec

> **Status: Done.** Implemented in commits `36e9d65` (stable publish-gated attachment route) and `780a5ef` (URL-rewrite `/api` prefix fix).

## Goal

Replace the 1-hour-expiring JWT-signed attachment URLs currently baked into published blog post HTML and OG-image URLs with a stable URL whose access is checked live against publish state — so external consumers that cache the public API's HTML (e.g. a statically built personal site pulling from `/api/public/blog/posts` at build/migration time) never see images go dead mid-cache-life.

## Depends on

Nothing. Builds on the already-implemented Blog Publishing Platform (`specs/BLOG_MASTER_SPEC.md`).

## Root cause

- `BlogPublicService.serializePost` (`apps/server/src/core/blog/services/blog-public.service.ts:136-143`) runs post content through `prepareContentForPublic` (`apps/server/src/common/helpers/attachment-share.util.ts`), which mints a `TokenService.generateAttachmentToken` JWT (`apps/server/src/core/auth/services/token.service.ts:83`, `expiresIn: '1h'`) per attachment and rewrites `src`/`url` to `/api/files/public/{id}/{name}?jwt=...` (`apps/server/src/core/share/share.util.ts`).
- `ogImageUrl` (`blog-public.service.ts:171-183`) does the same for the single OG-image attachment.
- Both were designed for live, per-request rendering — `ShareController`/`BlogRenderController` mint a fresh token on every hit, which is fine as long as nothing caches the HTML beyond an hour. It breaks the moment a consumer caches that HTML longer — e.g. a statically built personal site pulling from the public JSON API at build/migration time: the JWT embedded in the cached copy expires, and `/files/public/:fileId/:fileName` (`apps/server/src/core/attachment/attachment.controller.ts:216-260`) then rejects it ("Expired or invalid attachment access token"), so the image fails to load.
- The underlying bytes are not behind a short-lived S3/R2 presigned URL — `sendFileResponse` (`attachment.controller.ts:471-539`) always proxies them through the Nest server via `StorageService`. The only thing with a hard expiry is Workion's own JWT gate, so this is fully fixable server-side without touching storage.

## Fix

1. **New repo method** — `BlogPostSettingsRepo.isPublished(pageId: string): Promise<boolean>` (`apps/server/src/database/repos/blog/blog-post-settings.repo.ts`), reusing the existing `basePublishedQuery()` join (`blogPostSettings` ⨝ `pages` ⨝ `shares`, filtered on `pages.type = 'blog'`, `pages.deletedAt is null`, `shares.deletedAt is null`) but keyed on `pages.id = pageId` instead of slug, returning a boolean existence check.
2. **New public route** — `GET /files/blog/:fileId/:fileName` on `AttachmentController`, co-located with the existing `/files/public/:fileId/:fileName` route and reusing its private `sendFileResponse` helper. Unauthenticated, and deliberately **not** using `@AuthWorkspace()` — custom blog domains don't resolve a workspace the way the main app host does, which is the same reason `BlogPublicService`/`BlogRenderController` already do their own `resolveSpace()` lookup instead of relying on it:
   - Look up `attachment = attachmentRepo.findById(fileId)`; 404 if missing or `!attachment.pageId`.
   - 404 unless `blogPostSettingsRepo.isPublished(attachment.pageId)` **and** `!(await pagePermissionRepo.hasRestrictedAncestor(attachment.pageId))` — mirrors the exact guard `BlogPublicService.getPost`/`listPosts` already apply to the post itself (`blog-public.service.ts:44-49`), so an attachment is never reachable through this route in a state where the post itself wouldn't be.
   - Serve via `sendFileResponse(req, res, attachment, 'public')`, but with `Cache-Control: public, max-age=31536000, immutable` instead of the current `max-age=3600` — safe because attachments are never mutated in place (no replace-by-id flow exists in `attachment.service.ts`; edits always produce a new attachment row/id).
3. **`BlogPublicService.serializePost`** (`blog-public.service.ts:127-169`): stop calling `prepareContentForPublic`. Add a blog-specific rewrite (new helper, e.g. `prepareContentForBlog(content)`) that walks the doc the same way (`isAttachmentNode` from `attachment-node-types.ts`, same `src`/`url` attrs) but rewrites straight to `/files/blog/{attachmentId}/{fileName}` — no per-node token minting, no `TokenService` dependency on this path.
4. **`ogImageUrl`** (`blog-public.service.ts:171-183`): drop the `tokenService.generateAttachmentToken` call; emit `${origin}/api/files/blog/{attachment.id}/{encodeURIComponent(attachment.fileName)}` directly.
5. **`absoluteAttachmentUrls`** (`blog-public.service.ts:196-202`): extend the regex to also match `files/blog/...` (it currently only matches `files/public/...`) so these new relative paths still get the correct absolute origin prepended for custom-domain contexts.
6. Leave `/files/public/:fileId/:fileName?jwt=` and `TokenService.generateAttachmentToken`'s 1h expiry untouched — regular page shares (`share.service.ts`) render server-side per request and aren't affected by this bug; changing that path is out of scope.

## Edge cases

- Unpublishing a post now takes effect immediately for its images too (previously they'd silently keep working until the JWT's 1h expiry ran out). Slight behavior change, but it's the correct tightening for a live-checked URL — access now tracks publish state in real time instead of an independent timer.
- Restricted ancestor added after publish: covered, same guard as the post itself already uses.
- Draft posts (settings saved, never published) never had public images before and still don't — `isPublished` requires an active `shares` row.
- Deleted attachment still referenced by published post content: `findById` returns nothing → 404, same as today.
- `fileName` in the URL is cosmetic only, same as the existing route — `Content-Disposition` always uses the DB's `attachment.fileName`, not the URL param.
- Already-cached HTML on the user's personal site (minted before this fix ships) still has the old `?jwt=` URLs and will still go dead on its original 1h clock — this fix only changes what's emitted going forward. The personal site needs one refetch/rebuild after deploy to pick up the new stable URLs.

## Tests

- `BlogPostSettingsRepo.isPublished`: true for a page with an active share; false for draft/unpublished/deleted-share/non-blog-page.
- New `/files/blog/:fileId/:fileName` route (controller-level, mocked repos): 200 + long `Cache-Control` for a published post's attachment; 404 for unpublished, restricted-ancestor, non-blog-page, and missing-attachment cases.
- `BlogPublicService.serializePost` / `ogImageUrl`: emitted `html` and `ogImageUrl` contain `/files/blog/` paths with no `jwt` query param.

## Definition of done

`/api/public/blog/posts` (and `/posts/:slug`) return image `src`/`url`/`ogImage` values that stay valid indefinitely for a published post — verified by fetching the JSON, confirming there's no `jwt=` param, and confirming `/api/files/blog/...` serves the file successfully on its own. Unpublishing the post makes that same URL 404 immediately.

## Out of scope

Changing the share-link (`/s/:token`) attachment flow, the S3/R2 storage layer, or the 1h expiry used for other JWT-gated attachment contexts (chat attachments, avatars, etc.).
