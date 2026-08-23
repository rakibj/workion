# Client List Linked Spaces Spec

> Status: **Implemented (2026-08-24).**

## Goal

Make the Clients page useful as an overview by showing every Client visible to
the current user and the Spaces linked to each Client, without requiring the
user to open each Client detail page.

## Scope

- `GET /clients` now returns every visible Client with its readable linked
  Spaces. The existing Client visibility rule remains unchanged.
- Client cards show status, linked Space names, and direct Space links.
- The list uses one request and never issues a Client-detail request per card.
- Linked Spaces that the requester cannot read are excluded from the response.
- Linking or unlinking a Space invalidates the Clients overview query.

## API contract

```
GET /clients -> Array<IClient & { spaces: ISpace[] }>
```

## Verification

- Added service tests for readable and unreadable linked Space filtering.
- Focused `client.service.spec.ts` test run passed.
- Production client build passed.

## Out of scope

- Changing Client visibility or Space permissions.
- Editing Client-to-Space links from the list page.
- Projects, contacts, portal behavior, and pagination/search redesign.
