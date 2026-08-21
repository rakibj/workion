# Edition & Entitlement Architecture — Master Spec

> Foundational spec for the internal-vs-public split called out in CLAUDE.md's "Editions: Internal vs Public" and "Next Major Direction: Client Layer" sections. This must land before the Client entity spec — client pricing tiers depend on the entitlement resolution this spec builds.

## Goal

One codebase, one set of features and updates, serving two contexts:

- **Internal** — Gameloops/Cognitive Peak's own deployment. Every feature on, no limits, nothing gated.
- **Public** — future AppSumo-sold workspaces. Feature set and usage limits (clients per workspace, users, domains, etc.) vary by purchased tier.

Decisions already made (2026-08, logged in CLAUDE.md):

- **Runtime flags, not build-time exclusion**, as the default gating mechanism. A workspace's entitlement is resolved per-request from a plan attribute; internal workspaces resolve to "everything enabled." Build-time exclusion is a narrow exception for a specific feature only if the Pre-Launch Gate licensing audit finds one that legally can't ship hidden-but-present — not the default.
- **Client portal is a filtered view over Spaces/permissions**, not a separate frontend surface (relevant to how tier limits like "clients per workspace" will eventually be counted — a client will map to a Space or a group of Spaces, not a new top-level entity that duplicates the permission model).

## Existing infrastructure this builds on (verified against source, 2026-08-21)

Docmost upstream already shipped multi-tenant SaaS scaffolding that's dormant in this fork:

- `workspaces.plan` (`string | null`) and `workspaces.licenseKey` columns already exist (`apps/server/src/database/types/db.d.ts:461,464`). No migration needed to add a plan column.
- `workspace.service.ts#create` only populates `plan`/`hostname`/`trialEndAt`/`billingEmail`/`stripeCustomerId` when `environmentService.isCloud()` is true (`CLOUD` env var, default `false`). Workion's current internal VPS deployment runs with `CLOUD` unset, so `plan` is `null` on every existing workspace today.
- `POST /workspaces/entitlements` (`workspace.controller.ts:66-80`) already calls `licenseCheckService.resolveTier(licenseKey, plan)` / `resolveFeatures(licenseKey, plan)`.
- **But** `LicenseCheckService` (`integrations/environment/license-check.service.ts`) is Docmost's own **Enterprise Edition license-gating system** — stubbed in this fork to unconditionally grant every `Feature` (`common/features.ts`: SSO, MFA, SCIM, audit logs, etc.). It resolves against Docmost's EE feature list, not a Workion-specific plan.

**Decision for this spec: do not repurpose `LicenseCheckService`/`Feature`.** Keep that system untouched (it's Docmost's own upstream EE mechanism — leaving it alone keeps the AGPL audit boundary clean: "we didn't modify Docmost's own license gating, we added an independent one"). Build a **separate, Workion-owned entitlement service** with its own plan enum, reusing the already-existing `workspaces.plan` column (repurposed with Workion-specific values instead of Docmost's `'standard'`) since it's an unused column today, not a new schema addition.

**Open sub-question this spec surfaces (recommend, don't block on):** should the public/AppSumo edition run as a second deployment of the same codebase (own DB, own VPS or same VPS/different container, `CLOUD=true`-style multi-tenant mode reusing the dormant `hostname`/`trialEndAt`/`billingEmail` scaffolding), keeping internal Gameloops data on a fully separate instance? That mirrors exactly what this dormant scaffolding was built for (Docmost Cloud: many workspaces, one instance, subdomain-per-workspace) and gives the cleanest blast-radius isolation between internal and paying-customer data. Recommend yes — flag for explicit sign-off during spec review, since it affects the deploy runbook, not just the code.

## Data model

No new tables. One repurposed column, one new concept:

- `workspaces.plan`: store one of a new `WorkionPlan` enum instead of leaving it null or using Docmost's `'standard'`. Proposed values: `internal` | `free` | `starter` | `pro` | `business` (AppSumo tier names are still unvalidated per CLAUDE.md — treat as placeholders, easy to rename later since it's just a string column).
- New `apps/server/src/common/entitlement/entitlement.ts`: defines `WorkionPlan` enum, a `WorkionFeature` enum (starts with just `blog`), and a static `PLAN_FEATURES: Record<WorkionPlan, WorkionFeature[]>` map plus `PLAN_LIMITS: Record<WorkionPlan, { clients: number | null; users: number | null; domains: number | null }>` map. Limits are `null` = unlimited (internal plan). Numbers are placeholders per CLAUDE.md — not meant to be final.
- New `EntitlementService` (`apps/server/src/common/entitlement/entitlement.service.ts`): `hasFeature(workspace: Workspace, feature: WorkionFeature): boolean` and `getLimits(workspace: Workspace)`. Resolution rule: `workspace.plan === null || workspace.plan === 'internal'` → everything enabled, all limits `null` (this is what keeps existing/internal workspaces from breaking — no plan set behaves exactly as today). Otherwise look up the plan in the maps.
- Existing workspace creation path (`workspace.service.ts#create`) is untouched by this spec — internal workspaces keep getting `plan: undefined` exactly as now. A later, separate change sets `plan` explicitly at signup once the public/multi-tenant deployment exists.

## API contract

- No new endpoints in this slice. `EntitlementService` is a plain injectable service, called from within existing controllers/guards — starting with the blog module (see Slice 2).
- `POST /workspaces/entitlements` is left as-is (it's Docmost's own EE endpoint, unrelated to this system) — not reused, not removed.

## Slices

### Slice 1 — Entitlement resolution core — **Done (2026-08-21)**

**Depends on:** nothing.

**What it does:** `WorkionPlan`/`WorkionFeature` enums and `PLAN_FEATURES`/`PLAN_LIMITS` maps (`common/entitlement/entitlement.ts`), `EntitlementService.resolvePlan/hasFeature/getLimits` (`common/entitlement/entitlement.service.ts`) — pure, DB-less, unit tested. Registered via a `@Global()` `EntitlementModule` imported in `app.module.ts` (mirrors how `EnvironmentModule` provides `LicenseCheckService`), so it's injectable anywhere without per-module wiring.

**Definition of Done:** ✅ `EntitlementService.hasFeature`/`getLimits` covered for internal/null plan (everything on), a restricted plan missing a feature, and an unknown/garbage plan string (fails safe to the most-restrictive plan — `FREE` — never crashes, never grants). 11 tests in `entitlement.service.spec.ts`, all passing. Server build (`tsc --noEmit`) clean.

### Slice 2 — Wire blog module to the entitlement check — **Done (2026-08-21), partial scope**

**Depends on:** Slice 1.

**What it does:** Added a reusable `@RequireFeature(WorkionFeature.BLOG)` decorator + `EntitlementGuard` (`common/entitlement/require-feature.decorator.ts`, `entitlement.guard.ts`) — a Reflector-based Nest guard, same shape as any other metadata-driven guard, meant to be reused by future gated features, not just blog. Applied to `BlogController` (`@UseGuards(JwtAuthGuard, EntitlementGuard)` + class-level `@RequireFeature(WorkionFeature.BLOG)`) — this is the authenticated create/settings/publish/unpublish path, i.e. the actual editorial gate. A workspace whose resolved plan doesn't include `blog` gets a `403 ForbiddenException` on every route in that controller; internal/null-plan workspaces are unaffected (`resolvePlan(null) → INTERNAL → has blog`).

**Scope note — deliberately not covered by this slice:** `BlogPublicController`, `BlogRenderController`, and `BlogSeoController` (the unauthenticated public JSON API / SSR / sitemap-rss-robots routes) are **not gated**. They resolve a space (and its workspace) dynamically per request via `BlogPublicService.resolveSpace`/`findPublishedBySlugAnywhere`, including primary-domain routes that search across every workspace with no single workspace in scope — gating those needs its own design pass (an extra lookup or join per request, and a decision on what the "anywhere" primary-domain routes even mean once multiple workspaces with different plans share one deployment). Since a plan without the `blog` feature can never produce a published post in the first place (publishing is blocked at the source in `BlogController`), the practical exposure is narrow: a workspace downgraded *after* already publishing keeps serving those old posts publicly until this gap is closed. Flagged here as follow-up work, not silently dropped.

**Definition of Done:** ✅ internal-plan (and null-plan, i.e. every existing workspace) behavior provably unchanged — verified via the full `entitlement` and `blog` Jest suites (11 + 19 tests) and `tsc --noEmit`. A workspace on a plan without `blog` gets a 403 from `EntitlementGuard`, not a silent 500 or a leak.

### Slice 3 — Tier limit enforcement (clients/users/domains)

**Blocked** on the Client entity spec (can't enforce a "clients per workspace" limit before "client" is a countable thing in the data model). Not in scope until then — listed here only so the entitlement data model above is designed with it in mind.

### Slice 4 — Admin-visible plan/limits UI

**Blocked** on Slice 3 (nothing meaningful to show until limits are enforceable). Frontend surface in workspace settings showing current plan, usage vs. limits, upgrade path. Not in scope now.

---

**Status:** Slices 1–2 implemented (2026-08-21). Slices 3–4 remain blocked on the Client entity spec. The open sub-question above (single shared instance vs. a second deployment for the public edition) is still unresolved and doesn't block Slices 1–2, but should be settled before any public/AppSumo workspace actually exists — it determines how much the BlogPublic* gating gap (noted under Slice 2) actually matters in practice.
