# Space List Caching — Spec

> **Status: Proposed, not approved.** Per CLAUDE.md's methodology, get approval before implementing.

## Goal

Make the space list (sidebar/space picker) load instantly from cache like other frequently-accessed entities already do, instead of doing a full uncached round trip on every mount.

## Depends on

Nothing.

## Current state

**Client:** `useGetSpacesQuery` (`apps/client/src/features/space/queries/space-query.ts:38-47`) explicitly sets `refetchOnMount: true` with no `staleTime`, which **overrides** the app's global React Query defaults (`refetchOnMount: false`, `staleTime: 5min`, `gcTime: 30min`, set in `main.tsx:26-36`) — forcing a network refetch every single time any component using this hook mounts, regardless of how fresh the cached data already is.

**Server:** `POST /spaces` (`space.controller.ts:52-94`, `getWorkspaceSpaces`) → `SpaceMemberService.getUserSpaces` (`space-member.service.ts:402-407`) → `SpaceMemberRepo.getUserSpaces` (`space-member.repo.ts:390-421`), a raw Kysely cursor-paginated query with a member-count subquery, executed fresh every call — **no `withCache` anywhere in this path**, unlike every other entity lookup in the codebase (`space.repo.ts:findById`, `user.repo.ts`, `workspace.repo.ts`, `page.repo.ts` all wrap their base lookups in `withCache` + `CacheKey`, `common/helpers/with-cache.ts:1-27`, `common/helpers/cache-keys.ts:1-33`). The controller also runs a *second* uncached query per request, `SpaceMemberRepo.getUserRolesForSpaces` (`:329-353`), to attach each user's role.

## Reference pattern to match ("cached for speed" elsewhere)

**Server:** single-entity lookups (`findById` for space/user/workspace/page) wrap the base query in `withCache(cacheManager, CacheKey.X(id, workspaceId), TTL_MS, fn)`, with an explicit `invalidateXCache(id, workspaceId)` called from every mutation method in the same repo right after the write (e.g. `space.repo.ts:125,149,173,201,284`). TTLs are short (1-5 min) — the safety net, not the primary correctness mechanism; invalidation-on-write is.

**Client:** `useCurrentUser` (`features/user/hooks/use-current-user.ts:6-17`) and `useAppVersion` (`features/workspace/queries/workspace-query.ts:232-242`) both just *don't fight* the global React Query defaults — no `refetchOnMount` override, letting `staleTime` do its job. `useCurrentUser`'s result is additionally mirrored into a `localStorage`-backed Jotai atom (`currentUserAtom`, `atomWithStorage`, `features/user/atoms/current-user-atom.ts:6-9`, populated in `user-provider.tsx:54-61`) so the app can paint synchronously from the last-known value on reload, before the network request even resolves.

## Backend changes

- `space-member.repo.ts:390-421` (`getUserSpaces`) — wrap in `withCache`, new `CacheKey.USER_SPACES(userId, workspaceId, paginationParams)` (`cache-keys.ts`). This list is **paginated and per-user** (unlike existing cached lookups, which are single-entity by id) — the cache key must include enough of the pagination/query params to avoid serving page 2 when page 1 was requested; consider caching only the common case (default/no-params call, mirroring how `space.repo.ts`'s `findById` only caches when `!includeMemberCount && !trx`) rather than every param combination, to avoid an unbounded key space.
- Add `SpaceMemberRepo.invalidateUserSpacesCache(userId, workspaceId)`, called from every mutation that changes a user's space membership set or role: space create, space delete, add/remove member, role change (`space-member.repo.ts` and `space.repo.ts` — enumerate exact call sites during implementation, following the same "every repo method that writes calls its own invalidate" convention already used for `invalidateSpaceCache`/`invalidateUserCache`/`invalidateWorkspaceCache`).
- `SpaceMemberRepo.getUserRolesForSpaces` (`:329-353`) — evaluate whether it can be folded into the same cached payload (since roles change on the same mutations that would already invalidate the list cache) rather than left as a separate uncached call on every request.
- TTL: short (1-2 min, matching `SPACE_CACHE_TTL_MS`/`USER_CACHE_TTL_MS`), since invalidation-on-write is the primary correctness mechanism, not the TTL.

## Frontend changes

- `space-query.ts:38-47` (`useGetSpacesQuery`) — remove the `refetchOnMount: true` override, letting it inherit the global defaults (`staleTime: 5min`) like `useCurrentUser`/`useAppVersion` already do.
- Optional stretch, matching the `currentUserAtom` pattern: mirror the space list into a `localStorage`-backed Jotai atom so the sidebar renders synchronously from last-known data before the query resolves. The React Query-level fix alone already addresses "refetch on every mount"; the atom mirror is purely about the very first paint after a hard reload.

## Edge cases

- A space is created/deleted/renamed by another user in the same workspace — the acting user's own client gets a fresh list via their own mutation's cache update, but *other* logged-in users only see it after their TTL expires (1-2 min), since there's no WS push for space-list changes today. Acceptable staleness window, consistent with how single-space/user/workspace lookups already behave.
- A user's role in a space changes (e.g. demoted) — the cached list must not appear to grant stale elevated permissions beyond the TTL window; this is a *display* cache only — actual authorization stays enforced server-side per-request regardless of what the cached list shows.

## Tests

Server: `withCache` wrapping of `getUserSpaces` returns the cached value on a second call without hitting the DB (mock `cacheManager`), and the invalidation call clears it. Follow the existing repo test conventions (`Test.createTestingModule` + `jest.Mocked`) per CLAUDE.md.

## Definition of done

Navigating away from and back to a page that mounts `useGetSpacesQuery` within the staleTime window shows the space list instantly with no network request; creating/renaming/deleting a space is reflected immediately for the acting user and within the TTL window for others.

## Out of scope

WS-push invalidation for other users' clients (would make staleness near-zero but is a separate, larger change — flag as a possible follow-on); caching other paginated list endpoints elsewhere in the app (this spec is scoped to the space list specifically).
