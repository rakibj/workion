# Client Member Status and Removal Spec

> Status: **Implemented (2026-08-24).**

## Goal

Make the relationship between a Space member and its linked Client visible,
idempotent, and reversible without losing the Client's contact record.

## Scope

- The Space Settings member list resolves the linked Client's contacts alongside
  its direct Space members.
- A direct user member who is not a Client contact shows **Add to {Client}** in
  the actions menu. Once associated, that action is replaced by **Remove from
  {Client}**. The latter is a clearly labelled Client action and remains
  separate from **Remove space member**.
- Adding and removing display success/error feedback and disable the affected
  action while the request is in progress.
- Removing a member from the Client clears only the `user_id` / portal-member
  association on that Client contact. It never deletes or archives the contact,
  and never changes workspace or Space membership. The contact continues to
  appear in the Client's Contacts tab with its name, email, phone, title, and
  primary flag intact.
- Client-member contacts are tagged **Client member** in the Client Contacts
  list. The same tag appears beside that user in the linked Space's member
  list. This covers every current UI that renders Client membership; a source
  label such as **Portal user** may appear in addition when applicable.

## API and data model

- Add `DELETE /clients/:clientId/contacts/members/:userId` with a `spaceId`
  query parameter/body value. The service verifies the actor can manage the
  Client, that the supplied Space is linked to it, and that the user has an
  active Client contact.
- Add a repository operation that updates the active Client contact by
  `(client_id, workspace_id, user_id)`, setting `user_id` to `NULL` and
  updating its timestamp. The contact remains active and its other fields are
  unchanged.
- Extend the Client-by-Space response (or add a narrowly scoped membership
  lookup) so the Space member list can determine membership without fetching
  unrelated Client data. The response must not expose contacts the viewer is
  not allowed to see.

## Rules and edge cases

- Groups cannot be Client members and receive no Client action or tag.
- Adding is idempotent: an already-associated member cannot be added again.
- Removing is idempotent from the UI; a stale remove request returns a clear
  not-found/conflict response rather than modifying another contact.
- If a manual contact has the same email as the member, association continues
  to merge into that contact as today. Removing subsequently keeps that manual
  contact and its metadata.
- Existing Client access and Space roles are unchanged by either action.
- Users without Space manage permission see the status tag but no add/remove
  controls.

## Verification

- Service tests: add is idempotent; remove clears `userId` while preserving the
  contact; remove never calls Space-member deletion; reader cannot add/remove.
- Frontend tests: non-client member offers Add; client member offers Remove and
  a tag; successful mutations refresh the displayed state; client detail tags
  member contacts.
- Run relevant server Jest tests and client typecheck/test suite.

## Result

- Focused service test suite: **7/7 passing** (`client-contact.service.spec.ts`).
- Client TypeScript check: passed.
- Server Nest build: passed.
