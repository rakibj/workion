# Blog Taxonomy & Featured Fields Spec

> Status: **Approved, implementation in progress.** Written from user feedback
> while testing blog publishing on 2026-08-25 (see also the same-session fix
> for the settings-save crash, landed separately in commit `6644b99`).

## Problem

`BlogSettingsModal` today only exposes SEO fields (slug, meta title/description,
OG image, canonical URL, robots, focus keyword) plus whatever ad-hoc custom
fields a space admin has configured under Space Settings → Blog. There is no
way to:

- Mark a post as **Featured** so it can be pinned/highlighted on the blog home.
- Set a **Priority** to control manual ordering, independent of publish date.
- Attach **Tags** (free-form, multiple).
- Attach a **Category** (single value), picked from categories already used in
  the space or typed as a new one.

None of `featured`, `priority`, `tags`, `category` exist as columns today —
they need real schema support, not just UI. The existing generic "custom
fields" mechanism (`space.settings.blog.customFields`, boolean/number/text only)
could technically hold `featured` and `priority`, but not `tags` (needs a list)
or `category` (needs cross-post autocomplete), and neither `featured` nor
`priority` would actually *do* anything — they'd just be inert values, when
the ask is clearly for them to affect the blog home/listing.

**Decision: first-class columns, not custom fields.** These four get real
`blog_post_settings` columns and real behavior in the public listing queries,
same tier as `slug`/`robotsIndex` etc.

## Data model

Migration adds four columns to `blog_post_settings`:

```
tags          text[]      not null default '{}'
category      varchar     null
featured      boolean     not null default false
priority      integer     not null default 0
```

- `tags`: free-form strings, no length/count cap enforced server-side beyond a
  sane per-tag `MaxLength` (mirrors `focusKeyword`'s 255).
- `category`: nullable, single value, no separate lookup table — "already-used
  categories" is served by a `DISTINCT category` query scoped to the space
  (see API below), same spirit as how `slug` uniqueness is scoped to the space.
- `featured`: drives a pinned/first section on the blog home and archive list;
  does not bypass `robotsIndex`/publish state.
- `priority`: manual sort weight, higher sorts first. Only breaks ties among
  otherwise-equal-recency posts — see ordering rule below.

## API contract

`UpsertBlogPostSettingsDto` gains:

```ts
tags?: string[];         // each entry @IsString @MaxLength(255), array capped at 20
category?: string | null; // @IsString @MaxLength(255)
featured?: boolean;
priority?: number;        // @IsInt
```

`GET /blog/posts/:pageId/settings` response includes the four new fields
(defaults `[]` / `null` / `false` / `0` for posts saved before this migration).

New: `GET /blog/posts/categories?spaceId=:spaceId` on `BlogController`
(authenticated, space-Read CASL check via `SpaceAbilityFactory`) → `string[]`
of distinct non-null `category` values already used by blog posts in that
space, for the settings modal's autocomplete.

**Gotcha found during implementation:** this could *not* live at the more
natural `GET /blog/categories` in its own controller — `main.ts`'s
`setGlobalPrefix('api', { exclude: [...] })` list includes `'blog/:slug'` for
the public blog-post SSR route, and Nest's exclude matching is by route
*shape*, not by controller. `blog/categories` has the same two-segment shape
as `blog/:slug`, so it silently lost its `/api` prefix and got served at
`/blog/categories` (colliding in spirit with the public blog namespace)
instead of `/api/blog/categories`. Nesting it under the existing
`blog/posts` controller as `blog/posts/categories` sidesteps this — that
shape doesn't match anything in the exclude list. See the exclude-list
comment in `main.ts` for the existing single-segment version of this same
gotcha (`:slug` vs `/health`).

Public JSON API (`blog-public.controller.ts` / `BlogPublicService`) post
payload gains `tags`, `category`, `featured`, `priority` in `serializePost()`.

## Ordering rule

`BlogPostSettingsRepo.listPublished` / `listPublishedAnywhere` (used by the
public listing endpoints, sitemap, and RSS) change default order from
`shares.createdAt desc` to:

```sql
ORDER BY blog_post_settings.featured DESC,
         blog_post_settings.priority DESC,
         shares.created_at DESC
```

Featured posts sort first as a block; within any group, higher priority sorts
first; publish date is the final tiebreaker. This is a behavior change for
every existing archive/RSS/sitemap consumer — acceptable since `featured`
defaults `false` and `priority` defaults `0`, so today's data sorts identically
to today's behavior until an admin actually sets these fields.

## UI (BlogSettingsModal)

- **Category**: Mantine `Select` (`searchable`, creatable via
  `getCreateLabel`/`onCreate` pattern — Mantine v7's combobox-based creatable
  select) — options populated from `GET /blog/categories`, free text becomes
  the new value directly (no separate "confirm new category" step).
- **Tags**: Mantine `TagsInput` (or `MultiSelect` with `searchable` +
  creatable) — type-to-add, backspace-to-remove chips.
- **Featured on home**: `Switch`, same style as the existing `robotsIndex`/
  `robotsFollow` switches.
- **Priority**: `NumberInput`, integer, default `0`. Placed next to Featured.

All four go in the existing `Stack`, grouped after the robots switches and
before the custom-fields divider (custom fields remain for genuinely
space-specific ad-hoc metadata, not this common set).

## Edge cases

- A post with no `category` set: modal shows empty Select, public payload
  `category: null`. Not required to publish (same as today's optional fields).
- Renaming/retiring a category is out of scope — no rename-across-posts tool;
  admins edit posts individually. (Flagged as a likely follow-up if this
  becomes a pain point, not built now.)
- `GET /blog/categories` returns `[]` for a space with no blog posts yet, not
  an error.
- Tags are case-sensitive, no dedup/normalization beyond trimming whitespace
  and dropping empty strings.

## Out of scope

- A dedicated "Category" or "Tag" management screen (rename, delete, merge).
- Filtering the public blog list/API by tag or category (a plausible fast
  follow, not asked for yet).
- Any change to the generic custom-fields mechanism.
- AI-generated or "keyword-optimized" meta description content — separate,
  editorial ask, not a code change.
