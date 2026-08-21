export enum WorkionPlan {
  INTERNAL = 'internal',
  TENANT_BASIC = 'tenant_basic',
  TENANT_PRO = 'tenant_pro',
}

export enum WorkionFeature {
  BLOG = 'blog',
}

export interface WorkionPlanLimits {
  clients: number | null;
  users: number | null;
  domains: number | null;
}

/**
 * Numbers are placeholders (CLAUDE.md: "Limits/pricing are unvalidated") — safe to
 * retune without touching resolution logic in EntitlementService.
 *
 * Adding a new module: add a WorkionFeature value, then add it to whichever plan(s)
 * below should have it. No other plumbing changes needed — EntitlementGuard,
 * EntitlementService, and getWorkspaceInfo()'s enabledModules array all read this
 * map generically.
 */
export const PLAN_FEATURES: Record<WorkionPlan, WorkionFeature[]> = {
  [WorkionPlan.INTERNAL]: [WorkionFeature.BLOG],
  [WorkionPlan.TENANT_BASIC]: [],
  [WorkionPlan.TENANT_PRO]: [],
};

export const PLAN_LIMITS: Record<WorkionPlan, WorkionPlanLimits> = {
  [WorkionPlan.INTERNAL]: { clients: null, users: null, domains: null },
  [WorkionPlan.TENANT_BASIC]: { clients: 1, users: 3, domains: 0 },
  [WorkionPlan.TENANT_PRO]: { clients: 20, users: 25, domains: 5 },
};
