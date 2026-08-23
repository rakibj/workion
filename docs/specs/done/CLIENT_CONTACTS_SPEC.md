# Client Contacts Spec

> Status: **Implemented (2026-08-23).** All five slices are implemented; migration execution remains environment-dependent because the local Compose database has no host port exposed.

## Problem

`docs/specs/done/CLIENT_ENTITY_SPEC.md` gave Workion a `clients` table, but it's purely a label: `id, workspace_id, name, status, created_by_id, timestamps` (migration `20260822T120000-client-entities.ts`), joined to Spaces only via `client_spaces`. There is no human behind a Client record — no contact name, email, phone, or link to an actual person who can log in.

Meanwhile Workion already has real people working with clients: **guest users** created via Space Invite Links (`docs/specs/done` — see "Space Invite Links (Guest Access)" in CLAUDE.md; `SpaceInviteLinkService`, `SignupService.guestSignup`/`guestJoin`). A guest who joins a Space linked to a Client today has zero recorded relationship to that Client — the join only exists implicitly, by tracing `space_members` → `client_spaces`.

This spec closes both gaps in one entity: **`client_contacts`**, which can represent either a portal user (a guest account, auto-linked) or a plain contact with no login (name/email typed in manually, e.g. someone in accounting who only needs to be reachable). One table, two sources, so the frontend and API don't need two parallel concepts.

This spec does **not** cover:
- The branded client portal itself (CLAUDE.md priority #3, still not started) — this spec makes contacts a real, queryable entity; a portal *view* scoped to a contact's own data is future work built on top.
- Any change to how guests are invited or what role they get in a Space — `SpaceInviteLinkService`/`SignupService` gain one additional write inside their existing transaction, nothing else changes about the invite flow.
- Multiple contacts on one `user_id` for the same client (see unique constraint below) — a guest is one contact per Client, not per Space.

## Data model

One new table.

### `client_contacts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | `gen_uuid_v7()` |
| `workspace_id` | uuid, FK `workspaces.id` cascade | denormalized, matches `projects.workspace_id` convention |
| `client_id` | uuid, FK `clients.id` cascade | |
| `user_id` | uuid, FK `users.id` cascade, nullable | set when this contact is an actual portal/guest account; null for a manually-entered contact with no login |
| `name` | varchar, not null | for `user_id` contacts, mirrors `users.name` at link time (see sync note below) |
| `email` | varchar, nullable | required when `user_id` is null (enforced in service, not DB — matches how `projects.description` etc. are service-validated) |
| `phone` | varchar, nullable | |
| `title` | varchar, nullable | e.g. "Marketing Director" — freeform |
| `is_primary` | boolean, not null, default `false` | UI hint for "who do we email first"; not enforced as singular (service allows multiple, frontend shows a star on all flagged) |
| `source` | varchar, not null, default `'manual'` | `manual \| guest_invite` — `guest_invite` rows are created by the invite-accept flow and are read-only for name/email in the UI (see below) |
| `created_by_id` | uuid, FK `users.id`, nullable | null for `guest_invite` source (system-created) |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | soft delete, matches existing convention |

Partial unique constraint: `(client_id, user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL` — a given guest account can only be linked once per Client (prevents duplicate auto-link rows if the same user joins two Spaces both linked to the same Client).

**Why not just extend `clients` with contact fields directly?** A Client can have more than one person (a marketing lead and a billing contact), and a Client's portal users are 0..N guest accounts — both need a child table, not columns on the parent.

**Sync note:** `name`/`email` on a `guest_invite`-sourced row are a snapshot copied in at link time, not a live join to `users`. If a guest later renames themselves, the contact row goes stale until re-synced. Given `users.name`/`email` changes are rare for guest accounts in practice, this spec accepts that drift rather than adding a live join or an update hook — flagged as a known limitation, not silently ignored.

## Auto-link behavior (guest → contact)

Hooked into the two existing transactional guest-join paths in `apps/server/src/core/auth/services/signup.service.ts`, both already running inside `executeTx`:

- **`guestSignup`** (new guest account + space join): after `spaceMemberService.addUserToSpace(newUser.id, link.spaceId, ...)`, look up `client_spaces` rows for `link.spaceId`. For each linked Client, insert a `client_contacts` row (`source: 'guest_invite'`, `user_id: newUser.id`, `name`/`email` copied from `newUser`) — skip if a non-deleted row for `(client_id, user_id)` already exists (defensive; shouldn't happen on first signup, but keeps the operation idempotent).
- **`guestJoin`** (existing user joining an additional Space): same lookup/insert after `spaceMemberService.addUserToSpace(userId, link.spaceId, ...)`.

If `link.spaceId` has no linked Client, nothing happens — most Spaces won't be Client-linked, and this must stay a no-op, not an error, in that case.

**Backfill:** guests who joined Client-linked Spaces *before* this spec ships have no retroactive `client_contacts` row. This spec does not include a backfill migration/script — existing guest↔Client relationships can still be seen by cross-referencing `space_members` → `client_spaces` as today, and an agency admin can manually add a contact for them via the API below if wanted. A backfill script is easy to write later if this gap turns out to matter in practice; not adding one speculatively.

## Permissions

Reuses the existing Space CASL ability, same pattern as `docs/specs/done/CLIENT_ENTITY_SPEC.md`.

- **View contacts:** same rule as viewing the Client itself — membership (any role) in at least one of the Client's linked Spaces.
- **Add/edit/delete a manual contact:** requires `admin`/`writer` in at least one of the Client's linked Spaces (same trust level as editing the Client's `name`/`status`).
- **`guest_invite`-sourced contacts:** not editable via `PATCH` at all (service rejects with `BadRequestException`, not just a frontend hide) — `name`/`email` should reflect the real account, not be silently overridden into a stale label. `is_primary`/`title`/`phone` remain editable on these rows since they're agency-side annotations, not identity fields. Deletable (soft-delete only removes the contact record, not the guest's Space membership or workspace account).

## API contract

Extends the existing `core/client/` module — no new top-level module.

```
GET    /clients/:id/contacts                                    → list contacts (manual + guest_invite), ordered isPrimary desc, then createdAt
POST   /clients/:id/contacts        { name, email?, phone?, title?, isPrimary? }
                                     → email required by DTO validation (manual contacts always need a way to reach them)
PATCH  /clients/:id/contacts/:contactId
                                     { name?, email?, phone?, title?, isPrimary? }  (manual)
                                     { phone?, title?, isPrimary? }                 (guest_invite — name/email rejected)
DELETE /clients/:id/contacts/:contactId                          → soft delete
```

`GET /clients/:id` (existing endpoint) response gains a `contactCount` field, matching the existing `linked-space count`/`project count` summary fields already shown on the client list per `CLIENT_ENTITY_SPEC.md`'s frontend section.

## Frontend

- Client detail page (`pages/clients/*`): new **Contacts** section alongside the existing Spaces/Projects lists.
  - Each row: name, title (if set), email, phone, a "Portal user" badge when `source === 'guest_invite'`, a star toggle for `isPrimary`.
  - "Add contact" button opens a modal (name + email required, phone/title optional) — same modal pattern as the existing "New Project" action.
  - Guest-invite rows: name/email rendered as plain text (not editable inline); phone/title/star remain editable; delete available via the same `modals.openConfirmModal` pattern used for Client/Project delete (`CLIENT_LAYER_CLEANUP_SPEC.md` Slice C).
- Client list page: no change (contact count is available but not required on the list view — avoids overcrowding the existing row).

## Slices

### Slice 1 — Migration + repo
**Depends on:** nothing.
**What:** Kysely migration for `client_contacts` (incl. the partial unique index via raw `sql`), regenerate `db.d.ts`, `ClientContactRepo` (`database/repos/client/`) with CRUD + `findByClientId`.
**DoD:** migration runs up/down cleanly against local Postgres; repo methods unit-tested against a mocked Kysely instance, per existing convention (see `client.repo.spec.ts`).

### Slice 2 — `ClientContactService` + CASL wiring
**Depends on:** Slice 1.
**What:** create/list/update/delete on `ClientContactService`, reusing `SpaceAbilityFactory` exactly as `ClientService` does. Update rejects `name`/`email` changes when `source === 'guest_invite'`.
**DoD:** unit tests cover: manual create/update/delete for a space writer; reader rejected (`ForbiddenException`); guest-invite row rejects a `name`/`email` patch but accepts a `title`/`isPrimary` patch; duplicate `(client_id, user_id)` insert is a no-op, not an error.

### Slice 3 — Auto-link hook in `SignupService`
**Depends on:** Slice 2.
**What:** the `guestSignup`/`guestJoin` insert described above, both inside their existing `executeTx` blocks.
**DoD:** unit tests on `SignupService` (extending its existing test suite) cover: joining a Client-linked Space creates a `guest_invite` contact; joining a non-linked Space creates nothing; joining a second Client-linked Space for an already-linked-elsewhere user only creates the new Client's contact, not a duplicate.

### Slice 4 — `ClientContactController` + DTOs
**Depends on:** Slice 2.
**What:** the four routes above, DTOs with class-validator decorators (mirrors `create-client.dto.ts`/`update-client.dto.ts`).
**DoD:** controller tests for 200/403/404 paths, plus the guest-invite name/email-rejection 400 path.

### Slice 5 — Frontend
**Depends on:** Slices 3–4.
**What:** Contacts section on the client detail page, add-contact modal, guest-invite badge/read-only fields, delete confirmation — described above.
**DoD:** manual smoke test — add a manual contact, mark it primary, sign up a new guest via an existing invite link to a Client-linked Space and confirm a `guest_invite` contact appears automatically, confirm a reader-role user can view the Contacts section but sees no add/edit/delete controls.

## Open questions to confirm before implementation

1. **Is `email` really required for manual contacts?** Proposed yes (a contact with no email and no login is just a name, not reachable). If there's a real case for a name-only contact, drop the requirement — cheap to change before Slice 1 lands, not after (DTO validation).
2. **Should `guest_invite` contacts be deletable at all**, given deleting one doesn't revoke Space access (that stays governed by `space_members`/invite links)? Proposed: yes, deletable — it's just the Client-side annotation, not an access control. Flagging so the asymmetry (delete the contact, guest still has Space access) is a deliberate choice, not a surprise.
3. **Contact count on the Client list view** — included in the API response either way (cheap); worth showing there or is Client detail enough? Frontend-only decision, doesn't affect Slices 1–4.

## Explicitly out of scope

- Branded client portal (CLAUDE.md priority #3) — this spec supplies the underlying "who is this Client's contact" data; a portal view scoped to a specific contact's login is separate, future work.
- Backfill of `guest_invite` contacts for pre-existing guest/Client relationships — see "Backfill" note above.
- Any change to invite-link creation, Space roles, or guest signup UX beyond the one additional DB write inside the existing transaction.
- Notification/email to a contact (e.g. "you've been added") — no notification system hook in this spec.
