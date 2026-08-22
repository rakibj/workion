# Edition Entitlements — Slice 3: Usage Limits

> **Status:** Approved — implementation not yet started.
> **Parent:** `docs/specs/ongoing/EDITION_ENTITLEMENT_SPEC.md`, Slice 3.

## Goal

Enforce the existing per-plan `clients`, `users`, and `domains` limits at every
write path that can increase the corresponding workspace usage. Existing and
internal workspaces remain unlimited. This slice does not change plan names,
pricing, feature availability, or the blog publishing workflow.

## Existing limits (unchanged)

| Plan | Clients | Users | Domains |
| --- | ---: | ---: | ---: |
| `internal` / null | unlimited | unlimited | unlimited |
| `tenant_basic` | 1 | 3 | 0 |
| `tenant_pro` | 20 | 25 | 5 |

The amounts remain placeholders and can be retuned in `PLAN_LIMITS` without
changing enforcement code.

## Definitions

- **Client usage:** active (`deleted_at IS NULL`) rows in `clients` for the
  workspace. Archiving a client releases one seat; linking an existing client
  to another Space does not consume a seat.
- **User usage:** non-deleted rows in `users` for the workspace, including
  owners, members, admins, and space-invite guests. Pending workspace
  invitations do not consume a seat.
- **Domain usage:** distinct non-empty `spaces.settings.blog.domain` values in
  active Spaces belonging to the workspace. Re-saving a Space with its current
  domain does not consume another seat; clearing a domain releases one.

## Enforcement design

Add an injectable `UsageLimitService` in `common/entitlement/`. It obtains the
resolved limits from `EntitlementService` and provides:

- `assertCanCreateClient(workspace)`
- `assertCanAddUser(workspace)`
- `assertCanSetBlogDomain(workspace, spaceId, domain)`

Each method performs its count and decision inside the caller's existing
transaction where one exists. It throws a `ForbiddenException` with a stable,
user-facing limit message if usage is already at the plan cap. A null limit
returns without querying usage.

Repository count methods must scope to the workspace and exclude soft-deleted
records. Domain counting must exclude the Space currently being edited so a
same-domain update remains valid.

## Write paths

1. `ClientService.create`: assert before inserting the client, after the
   caller's existing space-manage permission check.
2. `WorkspaceInvitationService.acceptInvitation`: assert immediately before
   creating the user. Creating an invitation remains allowed: capacity is
   checked at the irreversible seat-consuming action, so revoked or unused
   invitations never reserve seats.
3. `SignupService.guestSignup`: assert before inserting the guest account.
   `guestJoin` does not create a user and requires no seat check.
4. `SpaceService.updateBlogSettings`: assert only when the submitted domain is
   non-empty and differs from that Space's current domain. This is entitlement
   enforcement only; it does not alter publishing/rendering behavior.

All unchanged/over-limit paths return HTTP 403. Read paths, updates, archive,
unlink, invite revocation, and deletion are unaffected.

## Concurrency

Application-level `count then insert` is not sufficient to guarantee a hard
limit under concurrent requests. Slice 3 will use a transaction-scoped
PostgreSQL advisory lock keyed by workspace ID before counting and will keep it
until the associated insert/update completes. Every seat-consuming path above
must use that same lock. This serializes only limit-changing actions for one
workspace and does not introduce a schema migration.

## Tests (TDD)

- `UsageLimitService`: null/internal unlimited; basic at limit rejects;
  under-limit allows; domain update to the same value allows; unknown plan
  fails closed through the existing basic-plan resolution.
- Client service: creates below its cap and rejects at its cap without calling
  `clientRepo.create`.
- Workspace invite acceptance and guest signup: reject at cap without creating
  a user; existing success behavior remains covered.
- Space blog-settings service: `tenant_basic` cannot add a first domain;
  `tenant_pro` permits up to five distinct domains and permits a no-op update.
- Server type-check and the focused Jest suites pass.

## Out of scope

- Pricing, Stripe, checkout, plan selection, or changes to `PLAN_LIMITS`.
- A UI for plan/usage or an upgrade path (Slice 4).
- Blog feature gating, public rendering, publishing behavior, DNS/Caddy
  verification, and the blog smoke-test work.

## Definition of done

All four write paths enforce their configured limit, no internal/null-plan
workspace behavior changes, concurrent seat creation cannot exceed a cap, and
the tests above pass.
