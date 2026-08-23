# Client Member Invites Spec

> Status: **Approved (2026-08-23) — implementation in progress.** User approved the client-space picker.

## Goal

Replace inferred Client contact creation from generic Space invites with explicit, one-use Client member invites. A Client-bound invite has a required landing Space selected from that Client's linked Spaces. When accepted, it converts an existing manual contact with the same email (or creates one), links the contact to the account, and grants commenter membership to every linked Client Space.

## Data and API

- Add nullable `client_id` to `space_invite_links`, FK to `clients.id` (`SET NULL`). Generic links remain unchanged when null.
- `POST /spaces/invite-links/create` accepts optional `clientId`. If present, it must be linked to `spaceId`; server overrides role to `commenter` and `maxUses` to `1`.
- Client detail adds an **Invite client member** modal with a required picker of linked Spaces. It creates the same Client-bound link.
- Space Invite Links adds optional Client picker limited to Clients linked to that Space.

## Acceptance

For a Client-bound link, both new signup and existing-user join run transactionally:

1. Upsert the Client contact by active `(client_id, user_id)` first, otherwise active case-insensitive email. A matched manual contact retains agency annotations but is updated with `user_id`, account name/email, and source `guest_invite`.
2. Add the account as `commenter` to every linked Client Space it does not already belong to. Existing memberships and their roles are never downgraded.
3. Count the invite once. It may only be accepted by one person.

Generic Space invite behavior is unchanged, except it no longer infers a Client contact merely because the Space happens to be linked to a Client.

## Permissions and edge cases

- Creating any link retains the existing Space access check; Client-bound creation also verifies the selected Client/Space relationship.
- Contact changes and memberships are scoped to the same workspace.
- If a Client has no remaining linked Spaces, a Client-bound link cannot be created.
- Deleting a Client contact does not revoke Space access; this remains separate from membership management.

## Verification

- Service tests cover generic links, Client-bound role/use normalization, invalid Client/Space pairing, manual-contact conversion, all-Space commenter access, and no role downgrade.
- Frontend type check and production build pass.
