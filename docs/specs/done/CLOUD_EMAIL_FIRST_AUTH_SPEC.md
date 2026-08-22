# Cloud Email-First Authentication Spec

## Status

Implemented and verified — 2026-08-22.

## Problem

In cloud mode, `/login` is redirected to `/select`, which asks visitors for a
workspace hostname before they can enter their credentials. The hostname
lookup and emailed-workspace endpoints used by that page are not implemented.
This makes the expected email/password sign-in path unavailable. The public
signup journey also needs a dependable link back to that email-first login.

## Goal

At the cloud apex, users can sign in with email and password without knowing a
workspace hostname. After credentials are verified, the browser is redirected
to the user's tenant subdomain, where the existing short-lived exchange-token
endpoint creates the normal workspace-scoped session. Google signup/sign-in
remains available from the public entry points.

## Scope

### Server

- Add `POST /auth/cloud-login`, public and protected by `CloudGuard`.
- Validate the existing `LoginDto` body.
- Look up non-deleted users by case-insensitive email across cloud workspaces
  that have a hostname. Compare password hashes server-side and reject with
  the same generic `401 Email or password does not match` response if none
  match. Do not disclose workspace membership.
- Require verified email, preserve the existing verification-required response
  shape, and create the existing 10-second exchange token for the selected
  user's workspace.
- Return only `{ hostname, exchangeToken }`; never return a password or set a
  tenant cookie from the apex domain.
- Add `/api/auth/cloud-login` to the no-workspace pre-handler allowlist.
- Unit-test successful handoff, bad credentials, disabled users, unverified
  users, and selecting no hostnameless/internal workspace.

### Client

- In cloud mode, render the ordinary email/password login form at `/login`
  instead of routing to `/select`.
- Submit to the cloud-login endpoint and redirect through
  `exchangeTokenRedirectUrl(hostname, exchangeToken)`.
- Show Google sign-in in the same public login screen, using the existing
  Google SSO integration where configured.
- Change the cloud signup page's existing-account link to `/login`.
- Retire the hostname-first selector from the public routing path; it can stay
  unused until a workspace switcher is deliberately designed.

## Security and edge cases

- All credential validation, workspace resolution, and password comparisons
  happen on the server.
- Multiple matching memberships are resolved only after a successful password
  comparison. The first matching active tenant account is used; a future
  account-switcher can offer an explicit choice after authentication.
- A user who is unverified is directed to that tenant's existing verification
  page, with the current signed resend mechanism.
- The exchange JWT's existing tenant matching and short TTL remain the
  cross-subdomain boundary.

## Out of scope

- Cross-workspace account switching UI.
- Implementing the old `/workspace/joined` or `/workspace/find-by-email`
  endpoints.
- Changes to workspace signup data, billing, or entitlement behavior.

## Implementation notes

- `POST /auth/cloud-login` verifies credentials server-side across active cloud
  tenants and returns the existing 10-second exchange token for the matching
  tenant. It never puts credentials in a redirect or sets a cross-tenant
  cookie.
- The cloud `/login` screen now uses the normal email/password form and
  preserves the email-verification redirect. The existing Google entry point
  is shown there as well as on signup.
- Verification: server and client type checks passed; focused auth and
  workspace service tests passed; the client production bundle completed.
