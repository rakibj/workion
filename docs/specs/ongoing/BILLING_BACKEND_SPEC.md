# Billing Backend Spec

> Status: **Approved (2026-08-22) — implementation not started.** No code written yet, per CLAUDE.md's spec-then-implement methodology.

## Problem

Self-serve workspace *signup* is live (`docs/specs/done/MULTI_TENANCY_SPEC.md`) and the entitlement engine (`docs/specs/ongoing/EDITION_ENTITLEMENT_SPEC.md`) can gate features by plan — but there's no way to actually charge anyone. What exists today is Docmost's own dormant upstream EE scaffolding, never wired up in this fork:

- **DB schema** — `billing` table (Stripe subscription mirror: price/product/period/cancel fields) and `workspaces.stripeCustomerId` already migrated in (`20250106T195516-billing.ts`, `20250623T215045-more-billing-columns.ts`).
- **Env config** — `EnvironmentService.getStripePublishableKey()/getStripeSecretKey()/getStripeWebhookSecret()` already read `STRIPE_*` vars, unused by anything.
- **Dependency** — `stripe` npm package (`^17.7.0`) already in `apps/server/package.json`, never imported anywhere (`grep -rn "new Stripe"` returns nothing).
- **Frontend UI** — `apps/client/src/ee/billing/` has a complete pricing-tier component (`billing-plans.tsx`) calling `getCheckoutLink()`/`useBillingPlans()` — both call server routes that don't exist. It's a dead shell today.

This spec builds the missing middle: a real `BillingController`/`BillingService` that uses the Stripe SDK, ties checkout completion to `workspaces.plan` (which `EntitlementService` already reads), and replaces the frontend's fake plan list with real Stripe Price data.

**Depends on nothing from `CLIENT_ENTITY_SPEC.md`** — this can be built in parallel. It does *not* implement tier-limit enforcement (`clients`/`users`/`domains` counts) — that's `EDITION_ENTITLEMENT_SPEC.md` Slice 3, blocked on the Client entity separately.

## Decisions to confirm before implementation

1. **Real pricing tiers/amounts.** Every number in `PLAN_LIMITS`/`WorkionPlan` (`TENANT_BASIC`, `TENANT_PRO`) is currently a placeholder per CLAUDE.md. This spec needs real Stripe Products/Prices created in the Stripe Dashboard (test mode first) before Slice 2 can point at real price IDs — a business decision, not an engineering one, and the actual blocker for writing real code here.
2. **Monthly vs. annual, single price vs. seat-based** — the dormant frontend UI already supports monthly/annual toggle and tiered-by-seat-count pricing (`billing-plans.tsx`'s `pricingTiers`/`billingScheme`). Recommend starting flat (one price per plan, monthly + annual, no seat tiers) for v1 and only building the tiered-seat logic if/when it's actually priced that way — the UI component already supports it, so this is a scope decision, not a rewrite risk.
3. **Trial length** — `MULTI_TENANCY_SPEC.md`'s Slice 1 already sets `trialEndAt` at signup (`addDays(...)`, value not confirmed here) and a `TRIAL_ENDED` queue job constant already exists unused. Confirm the trial period and what "trial ended, no card on file" should do (block login? read-only? downgrade to a `FREE`-equivalent plan?).

None of these block writing the spec's approval — they block Slice 2+ actually running against production Stripe.

## Data model

No new tables — `billing` and `workspaces.stripeCustomerId`/`status`/`plan`/`billingEmail`/`trialEndAt` already exist and are sufficient. One addition:

- `WorkionPlan` (`common/entitlement/entitlement.ts`) needs a mapping to real Stripe Price IDs. Proposed: a new `PLAN_STRIPE_PRICES: Record<WorkionPlan, { monthly: string; yearly: string } | null>` map (`INTERNAL` → `null`, real workspaces → real price IDs) — env-var-driven (`STRIPE_PRICE_TENANT_BASIC_MONTHLY` etc.) rather than hardcoded, since test-mode and live-mode price IDs differ and this needs to work in both.

## API contract

New `core/billing/` module.

```
GET  /billing/plans                                    → public: plan names/prices/features, sourced from PLAN_FEATURES + Stripe Price data (or a static mirror — see Slice 1)
POST /billing/checkout        { priceId }               → authenticated (workspace owner only): creates a Stripe Checkout Session, returns { url }
GET  /billing/portal                                    → authenticated (workspace owner only): creates a Stripe Billing Portal session, returns { url }
POST /billing/webhook                                    → Stripe webhook receiver, signature-verified via STRIPE_WEBHOOK_SECRET, no auth guard (Stripe calls this directly)
```

Matches the existing frontend's expected shape (`ICheckoutLink`, `IBillingPortal`, `IBillingPlan` in `billing.types.ts`) — the dead shell becomes live without a frontend rewrite, only real data underneath.

## Webhook handling (the core of this spec)

`POST /billing/webhook` must stay a thin, idempotent dispatcher — Stripe retries on non-2xx and can deliver the same event twice.

- `checkout.session.completed` → look up `workspace` by `client_reference_id` (set to `workspaceId` when creating the Checkout Session in `POST /billing/checkout`), upsert a `billing` row, set `workspaces.plan` to the plan matching the purchased price, set `workspaces.stripeCustomerId` and `status = 'active'`.
- `customer.subscription.updated` → update the matching `billing` row's `status`/`period_end_at`/`cancel_at_period_end`; if the price changed (upgrade/downgrade), update `workspaces.plan` to match.
- `customer.subscription.deleted` → set `billing.status = 'canceled'`, `workspaces.plan` back to the most-restrictive real plan (`TENANT_BASIC`) — never silently promote to `INTERNAL`.
- Every handler upserts on `stripe_subscription_id` (already a unique constraint on `billing`) so a redelivered webhook is a no-op, not a duplicate row.
- Unrecognized event types: log and return 200 (per Stripe's own guidance — don't fail the endpoint for event types not yet handled).

## Permissions

- **All four routes are gated by the existing `CloudGuard`** (`core/auth/guards/cloud.guard.ts`), the same guard `MULTI_TENANCY_SPEC.md`'s signup routes use — makes every billing route a permanent no-op on Gameloops' own internal deployment (`CLOUD` unset there), by construction rather than by convention. This is the one gap the original draft missed: nothing about the DB schema or env config prevents these routes from being *reachable* on Gameloops otherwise, even though nothing should ever call them there.
- `POST /billing/checkout` / `GET /billing/portal`: `CloudGuard` + workspace `owner` only (billing is the single most sensitive workspace-level action — matches Docmost's own convention of owner-gating billing UI, visible in the dormant frontend already checking a role before rendering `BillingPlans`).
- `POST /billing/webhook`: `CloudGuard` + no user auth (can't — Stripe calls it), but Stripe signature verification (`stripe.webhooks.constructEvent`) is mandatory and non-optional, checked before touching any DB row. Belt-and-suspenders: even if a webhook were ever misconfigured to point at Gameloops' domain, `CloudGuard` rejects it before signature verification runs.
- `GET /billing/plans`: `CloudGuard` + public otherwise, matches the existing unauthenticated pricing page use case (see below). Also naturally returns nothing useful on Gameloops even without the guard (`INTERNAL` plan is excluded from the public list), but the guard makes it explicit rather than incidental.

## Public pricing page

Separate from the authenticated `BillingPlans` component in `ee/billing/` (which is post-signup, "manage your subscription"). A self-serve funnel needs an **unauthenticated** pricing page reachable before signup:

- New route, e.g. `/pricing`, outside the authenticated app shell — reuses `GET /billing/plans` (no auth needed) and links each plan's CTA to `/create` (the existing cloud-signup entry point from `MULTI_TENANCY_SPEC.md`), not directly to checkout — checkout requires a `workspaceId` that doesn't exist until signup completes. Post-signup, the new workspace owner lands on the authenticated `BillingPlans` view to actually subscribe.
- Whether this route lives in the existing `apps/client` app or a separate marketing surface is an open question — recommend building it inside `apps/client` first (fastest, reuses the existing plan-fetching hook) and revisiting only if a proper marketing site becomes a separate need later.

## Slices

### Slice 1 — `GET /billing/plans` + plan/price mapping
**Depends on:** decision #1 above (real Stripe Products/Prices must exist, at least in test mode).
**What:** `PLAN_STRIPE_PRICES` map, `BillingController.getPlans()` merging `PLAN_FEATURES` + `PLAN_LIMITS` (already exist) with live Stripe Price amounts (fetched via `stripe.prices.retrieve` at request time, or cached — decide caching approach here, `with-cache.ts` pattern already exists) into the `IBillingPlan[]` shape the frontend already expects.
**DoD:** unit tests mock the Stripe SDK client (never call real Stripe in tests); `INTERNAL` plan excluded from the public list (nothing to sell internally).

### Slice 2 — Checkout session creation
**Depends on:** Slice 1.
**What:** `POST /billing/checkout`, owner-only guard, creates a Stripe Checkout Session with `client_reference_id: workspaceId`, `success_url`/`cancel_url` pointing back into the workspace's own subdomain (per `MULTI_TENANCY_SPEC.md`'s subdomain-per-workspace model).
**DoD:** unit tests cover owner-only rejection for non-owners; Stripe client mocked, verifying the session is created with the correct `client_reference_id` and price.

### Slice 3 — Webhook receiver
**Depends on:** Slice 2 (needs `client_reference_id` set to correlate events back to a workspace).
**What:** `POST /billing/webhook`, signature verification, the three event handlers above, idempotent upsert into `billing` + `workspaces.plan`/`stripeCustomerId`/`status` update.
**DoD:** unit tests cover: bad signature rejected before any DB write; `checkout.session.completed` sets the right plan; a redelivered (same `stripe_subscription_id`) event doesn't create a duplicate row; `customer.subscription.deleted` never sets plan to `INTERNAL`.

### Slice 4 — Billing portal
**Depends on:** Slice 3 (needs a real `stripeCustomerId` on the workspace to open a portal session against).
**What:** `GET /billing/portal`, owner-only, `stripe.billingPortal.sessions.create({ customer: workspace.stripeCustomerId, return_url })`.
**DoD:** unit test covers the case where `stripeCustomerId` is null (workspace never checked out) — should 400, not throw a raw Stripe SDK error.

### Slice 5 — Wire the frontend to real data
**Depends on:** Slices 1–4.
**What:** confirm `apps/client/src/ee/billing/` (already built) works end-to-end against the now-real endpoints — likely no code changes needed, since it was built against this exact contract; this slice is verification, not new UI.
**DoD:** manual smoke test in Stripe test mode: view plans → checkout → webhook fires → workspace plan updates → `EntitlementService.hasFeature` reflects it → open billing portal → cancel → plan reverts.

### Slice 6 — Public `/pricing` page
**Depends on:** Slice 1 only (doesn't need checkout to exist yet — CTA can point to `/create` before Slices 2–4 are even done, so this can ship early for marketing purposes).
**What:** the unauthenticated pricing page described above.
**DoD:** reachable while logged out, on the apex/marketing domain, links correctly into `/create`.

## Explicitly out of scope

- Real pricing/tier decisions (business input required — see "Decisions to confirm").
- Seat-based/tiered-by-user-count pricing (the frontend supports it; this spec builds flat pricing first).
- Tier-limit enforcement (`clients`/`users`/`domains` counts) — `EDITION_ENTITLEMENT_SPEC.md` Slice 3, blocked on `CLIENT_ENTITY_SPEC.md`.
- Dunning/failed-payment email flows beyond what Stripe's own portal/emails already handle.
- Invoicing/tax (Stripe Tax or manual) — assumed out of scope until a specific jurisdiction requirement surfaces.
