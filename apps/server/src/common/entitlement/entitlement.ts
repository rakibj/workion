export enum WorkionPlan {
  INTERNAL = 'internal',
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  BUSINESS = 'business',
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
 */
export const PLAN_FEATURES: Record<WorkionPlan, WorkionFeature[]> = {
  [WorkionPlan.INTERNAL]: [WorkionFeature.BLOG],
  [WorkionPlan.FREE]: [],
  [WorkionPlan.STARTER]: [],
  [WorkionPlan.PRO]: [],
  [WorkionPlan.BUSINESS]: [],
};

export const PLAN_LIMITS: Record<WorkionPlan, WorkionPlanLimits> = {
  [WorkionPlan.INTERNAL]: { clients: null, users: null, domains: null },
  [WorkionPlan.FREE]: { clients: 1, users: 3, domains: 0 },
  [WorkionPlan.STARTER]: { clients: 5, users: 10, domains: 1 },
  [WorkionPlan.PRO]: { clients: 20, users: 25, domains: 5 },
  [WorkionPlan.BUSINESS]: { clients: null, users: null, domains: null },
};
