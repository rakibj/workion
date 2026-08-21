# Workspace Module Config Spec

> Status: **Done** (2026-08-22). Implemented as designed below. This is the source of truth for the module-config mechanism — CLAUDE.md's "Entitlement / Edition Gating" entry only points here, it doesn't restate the design.

## Problem

The entitlement system (`common/entitlement/`) already gates one module (Blog) behind a `WorkionPlan` enum, but that enum has 5 pricing-tier values (`INTERNAL | FREE | STARTER | PRO | BUSINESS`) that were placeholders from the original design — no pricing/tier decision has actually been made, and only one module has ever been wired to it. The user wants:

1. Three concrete named workspace configs: **Internal**, **Tenant Basic**, **Tenant Pro**.
2. A module-gating mechanism generalized enough that adding the *next* gated module is a registry entry + a guard, not new plumbing (confirmed: formalize the mechanism now, only actually wire up Blog).
3. Internal = every module on. Tenant (both tiers) = no Blog. Nothing else differs between Basic/Pro yet — future modules will slot into this the same way.

## Design

### 1. Rename the plan enum (`common/entitlement/entitlement.ts`)

```ts
export enum WorkionPlan {
  INTERNAL = 'internal',
  TENANT_BASIC = 'tenant_basic',
  TENANT_PRO = 'tenant_pro',
}
```

Drops `FREE` / `STARTER` / `BUSINESS`. `WorkionFeature` (the module enum) is unchanged — it already *is* the "module registry," just under a name coined before "module" was the agreed vocabulary. No rename of `WorkionFeature` → avoid busywork churn across `entitlement.guard.ts`, `require-feature.decorator.ts`, `blog.controller.ts` for a label-only change.

```ts
export const PLAN_FEATURES: Record<WorkionPlan, WorkionFeature[]> = {
  [WorkionPlan.INTERNAL]: [WorkionFeature.BLOG],
  [WorkionPlan.TENANT_BASIC]: [],
  [WorkionPlan.TENANT_PRO]: [],
};

export const PLAN_LIMITS: Record<WorkionPlan, WorkionPlanLimits> = {
  [WorkionPlan.INTERNAL]: { clients: null, users: null, domains: null },
  [WorkionPlan.TENANT_BASIC]: { clients: 1, users: 3, domains: 0 },   // carried over from old FREE — still a placeholder
  [WorkionPlan.TENANT_PRO]: { clients: 20, users: 25, domains: 5 },   // carried over from old PRO — still a placeholder
};
```

Adding a second module later: add a `WorkionFeature` value, add it to whichever `PLAN_FEATURES[...]` arrays should have it, and gate that module's entry point(s) — same pattern used for Blog below.

### 2. Generalize the client-visible signal (`workspace.service.ts`, currently blog-specific)

Today `getWorkspaceInfo()` returns a single hardcoded `hasBlogFeature: boolean`. Replace with a generic array so future modules don't need another field added here:

```ts
return {
  ...workspace,
  enabledModules: PLAN_FEATURES[this.entitlementService.resolvePlan(workspace.plan)],
};
```

(Exposes `EntitlementService.resolvePlan` result indirectly — fine, it's already derived from `workspace.plan` which `getWorkspaceInfo` already returns as-is today.)

Client: `IWorkspace.enabledModules?: string[]` replaces `hasBlogFeature?`. A small client-side mirror of module string keys (`features/workspace/workion-modules.ts`, just `{ BLOG: 'blog' }` — no business logic, the plan→module mapping stays server-side only) plus a `useHasWorkionModule(module: string)` hook mirroring the existing `useHasFeature` EE hook's shape, reading `workspace?.enabledModules`. `space-sidebar.tsx`'s Blog Post menu item switches from the one-off `hasBlogFeature` local to this hook.

### 3. Cloud signup default plan

`workspace.service.ts` `create()`: `plan = WorkionPlan.FREE` → `plan = WorkionPlan.TENANT_BASIC`.

### 4. `EntitlementService.resolvePlan()` fallback

`MOST_RESTRICTIVE_PLAN` (used when an unrecognized non-empty string is stored) changes from `WorkionPlan.FREE` → `WorkionPlan.TENANT_BASIC`. Unset/null still resolves to `INTERNAL` (unchanged — this is what makes every pre-existing internal-only workspace row, which has `plan = null`, keep working unmodified).

### 5. Data migration for already-provisioned rows

New Kysely migration updating any existing `workspaces.plan` values under the old strings (relevant only on `workionlive`, which has real signups; Gameloops' workspace has `plan = null` and is untouched):

| Old value | New value |
|---|---|
| `'free'` | `'tenant_basic'` |
| `'starter'` | `'tenant_basic'` |
| `'pro'` | `'tenant_pro'` |
| `'business'` | `'tenant_pro'` |
| `null` / `'internal'` | unchanged |

### 6. Test updates

`entitlement.service.spec.ts` and `workspace.service.spec.ts` updated to the new enum values (both already exist and will need their `WorkionPlan.FREE`/`.PRO` references swapped).

### 7. Applying the mechanism to Blog specifically

Route-level enforcement is `@RequireFeature(WorkionFeature.BLOG)` + `EntitlementGuard` on `BlogController`. Page creation doesn't get this treatment — it's one generic endpoint (`PageController.create()`) shared by every page type, not a dedicated blog controller — so it gates inline instead: `createPageDto.type === 'blog' && !entitlementService.hasFeature(workspace.plan, WorkionFeature.BLOG)` → reject. This is the pattern for any future module whose entry point isn't its own controller. Full blog-specific gating detail (including known gaps) lives in `docs/specs/ongoing/BLOG_MASTER_SPEC.md`, Addendum A.

## Out of scope (confirmed with user)

- Gating any module other than Blog in this pass (Kanban, AI Chat, Templates, DOCX import/export, HTML Artifact stay ungated/always-on).
- Any pricing/billing behavior tied to Tenant Basic vs Tenant Pro beyond the placeholder `PLAN_LIMITS` numbers already carried over.
- A DB-backed/admin-UI runtime toggle — matches CLAUDE.md's standing "runtime flags only, resolved per-workspace from a plan/entitlement attribute" decision; toggling a module for a config is a one-line code change (edit `PLAN_FEATURES`) + redeploy, not a UI action.
- The Blog space-settings tab (`space-blog-settings.tsx`) and the `PATCH /spaces/:spaceId/blog-settings` endpoint — flagged in the prior fix as a related gap with the same shape, not addressed here unless requested.
