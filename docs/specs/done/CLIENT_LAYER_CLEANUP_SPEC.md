# Client Layer Cleanup Spec

> Status: **Done (2026-08-23).** All five slices complete: A–D implemented and locally verified (typecheck, build, focused Jest suite), Slice E's deploy gate cleared with explicit user go-ahead, pushed to `origin/main` at `a4cd239`, deployed to both `workion` and `workionlive`, and the user confirmed the live visual checks (Blog tab gone from `workionlive`, Client/Project working end-to-end on `workion`) on 2026-08-23.

## Problem

A punch list of four small, independent gaps found while reviewing the Blog entitlement system and the Client/Project entity (`docs/specs/ongoing/CLIENT_ENTITY_SPEC.md`, backend done, frontend Slice 5 locally smoke-tested but not yet confirmed live):

1. **Blog tab leaks past entitlement on `workionlive`.** Space Settings shows a "Blog" tab regardless of workspace plan.
2. **A Space gives no indication it belongs to a Client.** `client_spaces` links exist, but nothing in the Space's own UI surfaces it.
3. **No way to remove a Client or Project.** Backend soft-delete (`DELETE /clients/:id`, `DELETE /projects/:id`) already exists; nothing in the frontend calls it.
4. **Client/Project on the internal (`workion`) production instance needs to be confirmed live and durably ungated.** Slice 5 of the Client Entity spec was only smoke-tested locally.

Each is scoped as its own slice below, one feature at a time per CLAUDE.md's methodology. The final slice is a deploy gate, not code — it's a hold point, not a rubber stamp.

## Root cause — Item 1 (Blog tab leak)

`apps/client/src/features/space/components/settings-modal.tsx:73-80` gates the Blog `Tabs.Tab` only on CASL (`spaceAbility.can(Manage, Settings)`), never on the workspace's plan. Contrast with `apps/client/src/features/space/components/sidebar/space-sidebar.tsx:82`, which already does this correctly for the sidebar's "View Blog" link via `useHasWorkionModule(WorkionModule.BLOG)` (`apps/client/src/features/workspace/hooks/use-workion-module.ts`) — that hook exists and is correctly used in exactly one place, not the other.

It is not purely cosmetic: `PATCH /spaces/:spaceId/blog-settings` (`apps/server/src/core/space/space.controller.ts:168`) has no `EntitlementGuard`/`@RequireFeature`, unlike every route in `blog.controller.ts`. A `workionlive` space admin can currently persist `spaces.settings.blog` even though the workspace's plan (`TENANT_BASIC`, `PLAN_FEATURES` = `[]`) has no Blog feature — publish itself would then 403, but the settings write silently succeeds.

`workionlive`'s workspace row already has `plan = 'tenant_basic'` (set correctly at creation per `docs/specs/done/MULTI_TENANCY_SPEC.md` Slice 3) — no data fix needed, this is a pure code gap on both ends.

## Slices

### Slice A — Gate the Blog tab and its write endpoint by entitlement

**What:**
- Frontend: wrap the Blog `Tabs.Tab` (and its `Tabs.Panel`) in `settings-modal.tsx` with `useHasWorkionModule(WorkionModule.BLOG)`, same call already used in `space-sidebar.tsx`.
- Backend: add `@UseGuards(EntitlementGuard)` + `@RequireFeature(WorkionFeature.BLOG)` to `updateBlogSettings` in `space.controller.ts`, matching the pattern in `blog.controller.ts`.

**DoD:** on a `TENANT_BASIC`/`TENANT_PRO` workspace (`workionlive`), the Blog tab is absent from Space Settings, and `PATCH /spaces/:id/blog-settings` returns 403 even if called directly. On `workion` (plan `null` → `WorkionPlan.INTERNAL`), no visible change.

**Status: Done (2026-08-23).** `settings-modal.tsx` now gates the Blog tab with `useHasWorkionModule(WorkionModule.BLOG)`; `updateBlogSettings` in `space.controller.ts` now carries `@UseGuards(EntitlementGuard)` + `@RequireFeature(WorkionFeature.BLOG)`. Verified live on `workionlive` — Blog tab confirmed absent from Space Settings.

### Slice B — Surface a Space's linked Client in the Space UX

**Problem today:** `client_spaces` has no reverse lookup — given a `spaceId`, nothing tells the frontend which Client (if any) owns it.

**Backend:**
- `ClientRepo.findBySpaceId(spaceId, workspaceId)` — join `client_spaces` → `clients`, return `IClient | null`.
- New route `GET /clients/by-space/:spaceId` on the existing `ClientController`, same visibility rule as the rest of the module (requires membership in the space — enforced by the existing space guard/ability, not a new CASL rule).

**Frontend:**
- `getClientBySpace(spaceId)` in `client-service.ts`.
- Space Settings → **General** tab (`space-details.tsx`): when a Client is linked, show a read-only "Client" field with the Client's name, linking to `/clients/:id`. Absent → nothing rendered (no empty state clutter).
- Space sidebar header (`space-sidebar.tsx`): small muted subtitle/badge with the Client name under the Space name, when linked.

**DoD:** linking/unlinking a Space to a Client (existing `POST/DELETE /clients/:id/spaces/:spaceId`) is reflected in both spots after a refetch; a Space with no linked Client renders unchanged from today.

**Status: Done (2026-08-23).** `ClientRepo.findBySpaceId`, `ClientService.getBySpace` (membership-gated via `SpaceCaslAction.Read`/`Page`), and `GET /clients/by-space/:spaceId` shipped with unit tests. Frontend: `useClientBySpaceQuery`, a read-only "Client" field in Space Settings → General (`space-details.tsx`), and a muted Client-name subtitle under the Space name in the sidebar (`space-sidebar.tsx`).

### Slice C — Delete/remove Client and Project from the UI

Backend already supports this (`DELETE /clients/:clientId` → `ClientService.archive()`, `DELETE /projects/:projectId`, both soft-delete via `deleted_at`) — this slice is frontend-only.

**Frontend:**
- `client-service.ts`: add `archiveClient(clientId)` and `deleteProject(projectId)`.
- `client-detail.tsx`: page-level menu action "Delete Client" → Mantine `modals.openConfirmModal` (same confirmation pattern as `space-invite-links.tsx`/`space-members.tsx`) → on confirm, calls `archiveClient`, invalidates the clients list query, navigates back to `/clients`.
- `project-detail.tsx`: same pattern, "Delete Project" → `deleteProject` → invalidate → navigate back to the parent client detail page.
- Both require the same `admin`/`writer` role already enforced server-side; the frontend hides the action rather than showing it disabled, consistent with existing space-settings patterns.

**DoD:** deleting a Client with linked Projects still succeeds (soft-delete is independent of children per the existing schema — no FK cascade block); a `reader`-role user does not see the delete action and a direct API call still 403s (already covered by existing service tests).

**Status: Done (2026-08-23).** `archiveClient`/`deleteProject` added to `client-service.ts`; `useArchiveClientMutation`/`useDeleteProjectMutation` added to `client-query.ts`. `client-detail.tsx` and `project-detail.tsx` each get a red trash `ActionIcon` in the page header, gated behind a Mantine `modals.openConfirmModal` confirmation, matching the existing `space-invite-links.tsx` pattern. On success, invalidates the relevant query and navigates back up a level.

### Slice D — Confirm Client/Project stays live and ungated on `workion` (internal)

**What:** two parts, not one:
1. **Durability guardrail, not a code change today:** Client/Project has no `WorkionFeature` entry — it's unconditionally available to every workspace, unlike Blog. Add a one-line comment next to `PLAN_FEATURES` in `apps/server/src/common/entitlement/entitlement.ts` noting that Client/Project must **not** be added to that gated-feature list for `WorkionPlan.INTERNAL` if a future slice (`EDITION_ENTITLEMENT_SPEC.md` Slice 3, tier limits) ever touches it — tier *limits* (count) are fine and already planned there; a hard feature *gate* on the internal workspace is not.
2. **Confirm it's actually live**, not just locally smoke-tested: this batch's deploy (Slice E below) is also where `CLIENT_ENTITY_SPEC.md` Slice 5 (currently "In progress" — implemented, locally smoke-tested, never deployed) gets pushed to `workion.gameloops.io` for the first time. Once live, do the one remaining manual check from that spec's Slice 5 DoD: a reader-role user can view but not edit a Client/Project on production.

**DoD:** `CLIENT_ENTITY_SPEC.md` Slice 5 status line updated to "Done" once verified live on `workion`; the guardrail comment is in place.

**Status: Done (2026-08-23).** Guardrail comment added next to `PLAN_FEATURES` in `entitlement.ts`. Confirmed live on `workion` — Clients nav, linked-Client display, and delete actions verified working; `docs/specs/done/CLIENT_ENTITY_SPEC.md` Slice 5 updated to Done.

### Slice E — Deploy gate (hold point, not automatic)

Once Slices A–D are implemented and locally verified (typecheck/build/tests green per the standard checklist), **stop and ask the user explicitly before pushing or deploying anything.** Do not push or run `deploy.sh` unprompted.

When asked to proceed, the deploy touches two independent targets — remember these from prior sessions:
- `workion` (Gameloops, primary) — standard `deploy.sh` flow per CLAUDE.md's "Deploying to VPS".
- `workionlive` — a **separate VPS deployment** (own git checkout, `.env`, containers) per the `workion_live_deployment` memory; it does not get updated by `workion`'s `deploy.sh` and needs its own deploy steps. This is the one that actually needs Slice A's fix, so it must not be skipped.
- `git push` on this machine has a known credential gap (GCM caches the wrong GitHub account) — the bundle+SSH workaround from the `git_push_credential_gap` memory applies if the normal push fails.
- If both deployments share `infra-net`, the `infra_net_app_alias_collision` memory applies to any Caddyfile touch — not expected for this spec's changes, but worth keeping in mind since Slice B/C touch no Caddy config and Slice A/D don't either.

**DoD:** user has explicitly said to proceed, both `workion` and `workionlive` are confirmed updated (Blog tab gone from `workionlive`'s Space Settings, Client/Project confirmed live on `workion`), and this spec's status line and `CLIENT_ENTITY_SPEC.md` Slice 5 are updated to reflect reality.

**Status: Done (2026-08-23).** User confirmed go-ahead. `git push origin main` hit the known credential gap (403, wrong cached GitHub account) — user pushed directly themselves rather than using the bundle workaround. Both VPS checkouts fast-forwarded to `a4cd239` (via `sudo`, since both `.git` dirs are root-owned) and redeployed: `workion` via its `deploy.sh` (clean, no pending migrations, `workion.gameloops.io` → 200), `workionlive` via its own `deploy.sh` targeting `workion-live-app`/`workion-live-redis` (clean, `workionlive.gameloops.io` → 200). User confirmed both live visual checks on 2026-08-23.

## API contract (new/changed only)

```
GET    /clients/by-space/:spaceId     → IClient | null      (new, Slice B)
PATCH  /spaces/:spaceId/blog-settings → now requires WorkionFeature.BLOG (Slice A, no contract shape change, adds a 403 case)
```

`DELETE /clients/:clientId` and `DELETE /projects/:projectId` already exist (Slice C wires the frontend to them, no backend change).

## Edge cases

- Space linked to a Client whose `status = 'archived'`: still show the Client name/link in Slice B (archived is a lifecycle flag, not a visibility rule — matches how archived Clients still appear in their own detail page today).
- Deleting a Client that still has linked Spaces or Projects: allowed (soft delete, no cascade block) — matches the existing `deleted_at` convention used elsewhere in the schema (`spaces`, `pages`). No new cascade/orphan-cleanup logic is introduced by this spec.
- `workion` (internal) Space Settings: Slice A must not remove the Blog tab there — `resolvePlan(null) === WorkionPlan.INTERNAL`, which has `BLOG` in `PLAN_FEATURES`, so nothing changes.

## Pricing

No pricing, tier-limit, or `PLAN_LIMITS`/`PLAN_FEATURES` value changes. This spec only makes existing gating actually enforced (Slice A) and existing backend delete capability reachable from the UI (Slice C) — it does not add, remove, or reprice any plan or entitlement. Per CLAUDE.md, all `PLAN_LIMITS` numbers remain unvalidated placeholders, untouched here. Real pricing/tier work is scoped separately in `docs/specs/ongoing/BILLING_BACKEND_SPEC.md` and is out of scope for this spec.

## Completion (Definition of Done)

- [x] Slice A: Blog tab + write endpoint gated by `WorkionFeature.BLOG`. Implemented, deployed, and verified absent on `workionlive`.
- [x] Slice B: `GET /clients/by-space/:spaceId` shipped; linked Client visible in Space Settings → General and the Space sidebar.
- [x] Slice C: Delete actions for Client and Project wired in the UI, confirmation modal, correct query invalidation/navigation.
- [x] Slice D: guardrail comment added; `CLIENT_ENTITY_SPEC.md` Slice 5 confirmed live and updated to "Done".
- [x] Slice E: user explicitly asked and confirmed before push/deploy; both `workion` and `workionlive` verified updated (200 responses) and confirmed via user visual check.
- [x] This spec's status line updated to Done and the file moved `ongoing/` → `done/`, per CLAUDE.md's spec-folder convention.
