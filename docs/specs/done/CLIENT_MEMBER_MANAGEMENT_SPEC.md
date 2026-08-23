# Client Member Management Spec

> Status: **Implemented (2026-08-23).**

## Goal

One parent Client may have multiple portal members. From a Space’s settings, an agency user can associate existing Space members with that Space’s parent Client. This is a Client membership/contact association, not a new Client record and not a change to the member’s existing Space role.

## Scope

- In Space Settings, each direct user’s action menu offers **Add to {Client}** when the Space has a linked Client; the Client detail Contacts section lists every resulting Client member.
- Agency users with Space manage permission can select one or more existing direct Space users and add each as a Client portal member.
- Adding a member upserts `client_contacts` for the parent Client using the member’s user ID/email; it preserves any manual contact annotations and marks the contact as a portal user.
- The section lists every Client member, so a Client can have multiple members across its linked Spaces.
- Removing a Client member soft-deletes only the Client contact; it does not remove the person from any Space or workspace.

## Rules

- This feature follows the product model of one parent Client with many member contacts. A Space must resolve to one Client before showing this section; Spaces attached to multiple Clients are treated as a data-integrity error and the UI asks the agency to resolve the linkage first.
- Existing user membership and role are never changed by association. Invite-created Client members still receive commenter access across all Client Spaces under `CLIENT_MEMBER_INVITES_SPEC`.
- Readers can see Client members but cannot add or remove them.

## Verification

- Service tests: writer can associate multiple users; reader is rejected; association preserves a manual contact’s title/phone; removal does not call Space membership deletion.
- Client build and server type checks pass.
