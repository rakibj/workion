# Lemon Squeezy Billing & Public Pricing

> Status: **Implementation complete and locally verified (2026-08-23).** The remaining completion gate is the documented Lemon Squeezy test-mode smoke test against the authorized public deployment; it cannot be run from a checkout with no Lemon configuration.

## Problem

Workion Cloud can create a workspace and resolve entitlements, but it cannot sell a subscription. The old upstream Stripe billing UI and database columns are dormant, not a working integration. Workion will use Lemon Squeezy for checkout, payment collection, tax handling, and customer subscription management.

## Launch offer

Flat subscriptions, no per-seat billing:

| Plan | Monthly | Annual | Included limits |
| --- | ---: | ---: | --- |
| Solo Founder | $9 | — | 3 spaces, 1 client, 3 users |
| Startup | $19 | — | 10 spaces, 10 clients, 10 users |

`FOUNDER5` reduces the first three Solo Founder payments to $5. `STARTUP9` reduces the first three Startup payments to $9. `INTERNAL` is never exposed for sale. Space limits are enforced before a new space is created; the internal plan remains unlimited. The count and insert share a transaction-scoped PostgreSQL advisory lock keyed by workspace ID, so concurrent creates cannot exceed the cap.

## Lemon Squeezy configuration

The Workion store contains a monthly subscription product for Solo Founder and Startup. Checkouts are created server-side through the Lemon Squeezy API, so the server can attach the authenticated workspace ID as checkout custom data. The customer-facing app never receives the API key.

Required production environment values:

```env
LEMON_SQUEEZY_API_KEY=
LEMON_SQUEEZY_STORE_ID=
LEMON_SQUEEZY_WEBHOOK_SECRET=
LEMON_SQUEEZY_VARIANT_BASIC_MONTHLY=2047360
LEMON_SQUEEZY_VARIANT_PRO_MONTHLY=
```

The dashboard webhook points to `https://workionlive.gameloops.io/api/billing/lemon-squeezy/webhook` and listens for `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, and `subscription_payment_failed`. It signs requests with `LEMON_SQUEEZY_WEBHOOK_SECRET`.

**Deployment boundary:** `workionlive.gameloops.io` is the public, multi-tenant billing deployment. `workion.gameloops.io` is the internal Gameloops deployment and is out of scope for this feature: do not deploy, configure Lemon Squeezy, or change its environment without explicit user approval. `CloudGuard` keeps billing routes unavailable unless `CLOUD=true`.

## Data model

A new migration adds Lemon Squeezy identifiers and subscription fields rather than overloading legacy `stripe_*` columns:

- `workspaces.lemon_squeezy_customer_id`
- `billing.lemon_squeezy_subscription_id` (unique)
- `billing.lemon_squeezy_customer_id`, `lemon_squeezy_product_id`, `lemon_squeezy_variant_id`
- `billing.customer_portal_url`, `update_payment_method_url`

The legacy Stripe columns remain untouched for migration safety and are not written by the new feature.

## API contract

All endpoints use `CloudGuard`; nothing billing-related is reachable on the internal Gameloops deployment.

```text
GET  /billing/plans                        public, returns static launch plans and enabled variants
POST /billing/checkout { variantId }       workspace owner only, returns Lemon checkout URL
GET  /billing/portal                       workspace owner only, returns signed Lemon customer portal URL
POST /billing/lemon-squeezy/webhook        public, HMAC-SHA256 signature verified
```

`POST /billing/checkout` creates a Lemon Squeezy Checkout for an allowed variant, pre-fills the owner billing email, and includes `{ workspace_id }` as checkout custom data. The success URL returns to the authenticated billing view. The controller never accepts a URL, amount, customer ID, or plan from the browser.

Webhook handling is idempotent: it upserts by Lemon subscription ID, derives the plan only from the configured variant mapping, updates `workspaces.plan`, `status`, and customer ID, and stores customer portal URLs sent by Lemon. A cancellation retains access until Lemon's `ends_at`; expiration or a failed payment updates the workspace to the restrictive Basic plan/status. Unknown events return `200` after logging.

## Public pricing page

`/pricing` is outside the authenticated layout and available only on Cloud. It presents the Solo Founder and Startup plans, their space limits, and the first-three-month launch offers; CTAs route to `/create`. A workspace must be created before checkout so billing has a tenant to attach to.

## Verification

Unit tests cover variant allow-listing, owner-only checkout, HMAC rejection before persistence, plan resolution, cancellation/expiry behavior, and webhook replay idempotency. A manual Lemon test-mode smoke test covers pricing → create workspace → checkout → webhook → plan update → customer portal.

**Local verification complete (2026-08-23):** focused billing/space Jest suites, server type-check, client type-check, and production client build all pass. The space limit is asserted inside the same transaction as the Space insert. The test-mode smoke test remains the only unchecked item because it requires configured Lemon credentials and the public `workionlive` environment.

## Explicitly out of scope

- Lemon identity verification, payout setup, and making the offer publicly sellable.
- Seat or usage billing.
- Client/user/domain limits and dunning email flows.
- Migrating historical Stripe billing records.
