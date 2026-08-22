# Client Entity Spec

> Status: **In progress (2026-08-22) — Slice 1 (migration + repositories).** Implementation follows CLAUDE.md's spec-then-implement methodology.

> ⚠️ **Naming guardrail (CLAUDE.md):** "Client" here means an **agency client** — a company Workion does work for, nested under the existing Space/permission model. This is unrelated to a **paid Workion workspace/tenant** (see `docs/specs/done/MULTI_TENANCY_SPEC.md`). A 2026-08-21 mix-up built a full Client-entity MVP in answer to what was actually a multi-tenant-workspace question, and was reverted the same session. This spec is the from-scratch replacement, scoped correctly this time.

## Problem

Per CLAUDE.md's "Next Major Direction: Client Layer," a client today is just a Space + guest users — there's no first-class model for Client or Project, no client-level view spanning multiple Spaces, and no status/timeline. This is priority #1 (critical) in the AppSumo handoff, and it's also what `docs/specs/ongoing/EDITION_ENTITLEMENT_SPEC.md` Slice 3 (tier limit enforcement — "clients per workspace") and `docs/specs/done/WORKSPACE_MODULE_CONFIG_SPEC.md`'s `PLAN_LIMITS[...].clients` field are blocked on — there's no countable "client" row to enforce a limit against.

This spec covers **Client** and **Project** entities only — enough to turn "onboard a client, track their projects" into first-class data. It deliberately does **not** cover:
- Deliverables as a separate entity (a project's deliverables are its Space's pages, for now)
- The approval workflow (review → changes requested → approved → delivered → published) — CLAUDE.md priority #4, its own future spec, layered on top of `projects.status` once this lands
- The branded client portal (CLAUDE.md priority #3) — a filtered view over this data, its own future spec
- Entitlement tier-limit enforcement (`clients` count vs `PLAN_LIMITS`) — unblocked by this spec but implemented in `EDITION_ENTITLEMENT_SPEC.md` Slice 3, not here

One feature at a time, per the repo's methodology.

## Data model

Three new tables, no changes to existing ones.

### `clients`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | `gen_uuid_v7()` |
| `workspace_id` | uuid, FK `workspaces.id` cascade | tenant scope |
| `name` | varchar, not null | |
| `status` | varchar, not null, default `'active'` | `active \| archived` — simple lifecycle, not the project pipeline |
| `created_by_id` | uuid, FK `users.id` | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | soft delete, matches existing table conventions (e.g. `spaces`, `pages`) |

### `client_spaces` (join table — a client can span multiple Spaces)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `client_id` | uuid, FK `clients.id` cascade | |
| `space_id` | uuid, FK `spaces.id` cascade | |
| `created_at` | timestamptz | |

Unique constraint on `(client_id, space_id)`. A Space with no `client_spaces` row is unaffected — existing Spaces continue working exactly as today; linking to a Client is opt-in, not a migration requirement.

### `projects`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `workspace_id` | uuid, FK `workspaces.id` cascade | denormalized for query convenience, same pattern as `pages.workspace_id` |
| `client_id` | uuid, FK `clients.id` cascade | a project belongs to exactly one client |
| `space_id` | uuid, FK `spaces.id` restrict | the Space its work/pages live in — must be one of `client_id`'s linked spaces (enforced in the service layer, not a DB constraint, since Kysely/Postgres can't easily cross-check a join table in a FK) |
| `name` | varchar, not null | |
| `description` | text, nullable | |
| `status` | varchar, not null, default `'planning'` | `planning \| in_progress \| in_review \| approved \| delivered \| archived` — mirrors CLAUDE.md's core vertical (Onboard → Collaborate → Execute → Review → Approve → Deliver); `archived` is an explicit escape hatch, not part of the forward pipeline |
| `due_date` | timestamptz, nullable | |
| `created_by_id` | uuid, FK `users.id` | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | soft delete |

No `deliverables` table — a project's deliverables are pages inside `projects.space_id`, same as any other Space content today.

## Permissions

No new permission tier. Reuses the existing Space CASL ability (`space-ability.factory.ts`), per CLAUDE.md's decision that "writes [are] gated by the existing Space CASL ability" — no separate Client/Project role model to maintain.

- **Create a Client:** any workspace member who is `admin`/`writer` in at least one Space (the one they'll link first). No workspace-owner-only gate — same trust level as creating a Space.
- **Link/unlink a Space to a Client:** requires `admin`/`writer` role in *that* Space — prevents someone from attaching a Space they don't control to a Client.
- **Create/edit a Project:** requires `admin`/`writer` in `projects.space_id`.
- **View a Client (and its Projects):** requires membership (any role, including `reader`) in at least one of its linked Spaces — a Client with zero linked Spaces the requester belongs to is invisible to them. This avoids leaking client names/relationships across unrelated teams sharing one workspace, and mirrors how Space visibility already works.
- **Archive/delete:** same role requirement as edit; delete is soft (`deleted_at`), matching existing table conventions.

## API contract

New `core/client/` module, mirroring `core/space/`'s shape (controller + service + repo).

```
POST   /clients                    { name, spaceId }              → create client, auto-links spaceId
GET    /clients                    ?page=&limit=                  → list clients visible to requester
GET    /clients/:id                                                → client detail + linked spaces + projects
PATCH  /clients/:id                { name?, status? }
DELETE /clients/:id                                                → soft delete
POST   /clients/:id/spaces         { spaceId }                     → link an additional space
DELETE /clients/:id/spaces/:spaceId                                → unlink

POST   /projects                   { clientId, spaceId, name, description?, dueDate? }
GET    /projects                   ?clientId=&spaceId=&status=     → filtered list
GET    /projects/:id
PATCH  /projects/:id               { name?, description?, status?, dueDate? }
DELETE /projects/:id                                                → soft delete
```

Status transitions on `PATCH /projects/:id` are **not** state-machine-enforced in this slice (any status → any status) — CLAUDE.md's approval-flow spec is where transition rules (e.g. "can't skip from `planning` to `delivered`") belong, since that's where "changes requested" and rejection paths get modeled too. Enforcing a partial state machine here would need redoing once that spec lands.

## Frontend

- New top-level sidebar entry **"Clients"**, alongside the existing Spaces list — Clients are the new primary vertical entity per CLAUDE.md's positioning decision, not a view nested inside Spaces.
- Client list page: name, status badge, linked-space count, project count.
- Client detail page: linked Spaces (with add/remove), Projects list (status badge, due date), "New Project" action.
- Project detail: name/description/status/due-date, a link into its Space (existing page tree), status dropdown limited to the six enum values.
- Create-Client modal: name + a Space picker (must own `admin`/`writer` in the chosen Space).

## Slices

### Slice 1 — Migration + repos
**Depends on:** nothing.
**What:** Kysely migration for `clients`/`client_spaces`/`projects`, regenerate `db.d.ts`, `ClientRepo`/`ProjectRepo` (`database/repos/`) with basic CRUD + `findVisibleToUser` queries (join through `client_spaces` → `space_members`).
**DoD:** migration runs up/down cleanly against local Postgres; repo methods unit-tested against a mocked Kysely instance (per this repo's existing test convention — no real DB in tests).

**Status: Done (2026-08-22).** Migration up/down was verified against an isolated local PostgreSQL 18 container. Generated types include the three new tables. Focused mocked-Kysely repository tests pass (4/4). The full server build still has two unrelated existing type errors in `trash-cleanup.service.ts` and `workspace.service.ts`.

### Slice 2 — `ClientService` + CASL wiring
**Depends on:** Slice 1.
**What:** `ClientService` (create/list/get/update/archive/linkSpace/unlinkSpace), each write path checking `spaceAbility.can(Manage, Space)` or equivalent via the existing `SpaceAbilityFactory` — no new ability factory.
**DoD:** unit tests cover: create succeeds for a space writer, fails (`ForbiddenException`) for a space reader; linking a space the user doesn't control is rejected; list excludes clients with no visible linked space.

**Status: Done (2026-08-22).** `ClientService` reuses `SpaceAbilityFactory` and requires `Manage Page`, which is granted to Space admins and writers. Tests cover writer create, reader rejection, unauthorized-space link rejection, and visibility-filtered list output (4/4 service tests; 8/8 combined Slice 1–2 tests).

### Slice 3 — `ClientController` + DTOs
**Depends on:** Slice 2.
**What:** the six client routes above, DTOs with class-validator decorators, matching the existing controller pattern (e.g. `space.controller.ts`).
**DoD:** e2e-style controller tests (or integration tests per existing convention) for the 403/404/200 paths.

**Status: Done (2026-08-22).** Added authenticated REST routes for create, list, detail, update, archive, and Space link/unlink, with validated client DTOs. Controller tests cover successful creation plus propagated 403 and 404 responses. Focused Slice 1–3 tests pass (11/11).

### Slice 4 — `ProjectService` + `ProjectController`
**Depends on:** Slice 1 (tables), reuses Slice 2's CASL pattern.
**What:** project CRUD, `space_id` validated as one of `client_id`'s linked spaces at create time.
**DoD:** unit tests cover: create rejected if `spaceId` isn't linked to `clientId`; status field accepts only the six enum values; filtering by `clientId`/`spaceId`/`status`.

**Status: Done (2026-08-22).** Added guarded project CRUD routes, validated project DTOs (including the six allowed statuses), and a service which exposes only projects whose parent Client is visible through an existing Space membership. Creation validates the selected Space belongs to the Client and requires `Manage Page` there. Focused Client/repository tests pass (17/17); the full server build has the same two pre-existing errors in `trash-cleanup.service.ts` and `workspace.service.ts`.

### Slice 5 — Frontend
**Depends on:** Slices 3–4.
**What:** sidebar entry, list/detail pages, create modals, status badge component — described above.
**DoD:** manual smoke test — create a client, link a second space, create a project, change its status, confirm a reader-role user can view but not edit.

**Status: In progress (2026-08-22).** The UI is implemented: a Clients navigation entry, client list/detail views, space linking, project creation, status editing, and project detail routes. The production client build passes. An isolated runtime API smoke test completed successfully: create Client → link a second Space → create Project → update status to `in_review`, with the Client detail returning both Spaces. Reader write denial is covered by the focused service tests. The only remaining validation is a browser-level reader-role visual smoke test against a running local stack.

## Open questions to confirm before implementation (not blocking the spec's approval, but worth a decision)

1. **Sidebar placement** — top-level "Clients" nav item (recommended above) vs. nested under an existing menu. Affects Slice 5 only.
2. **Status enum naming** — `planning/in_progress/in_review/approved/delivered/archived` as proposed, or different labels? Cheap to rename later (just a varchar), but worth settling once so the frontend badge component isn't rewritten.
3. **Multi-space projects?** — this spec assumes a project lives in exactly one Space (matching "deliverables are pages in that Space"). If a project ever needs to span multiple Spaces, that's a bigger change deferred to a future spec — flagging so it's a deliberate deferral, not an oversight.

## Explicitly out of scope

- Deliverable entity, approval workflow, branded client portal, agency AI — each is its own future spec per CLAUDE.md's priority list.
- Entitlement tier-limit enforcement (`clients` count) — this spec makes it *possible* (a countable `clients` table now exists), `EDITION_ENTITLEMENT_SPEC.md` Slice 3 is where it's actually wired.
- Billing/pricing page — separate spec (`BILLING_BACKEND_SPEC.md`, drafted alongside this one).
