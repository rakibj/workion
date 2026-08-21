import { Injectable } from '@nestjs/common';
import {
  PLAN_FEATURES,
  PLAN_LIMITS,
  WorkionFeature,
  WorkionPlan,
  WorkionPlanLimits,
} from './entitlement';

const KNOWN_PLANS = new Set<string>(Object.values(WorkionPlan));

/**
 * An unrecognized plan value must fail safe toward the most restrictive plan,
 * not toward "internal" (everything on) — a typo or a stale value should never
 * accidentally unlock every feature.
 */
const MOST_RESTRICTIVE_PLAN = WorkionPlan.TENANT_BASIC;

@Injectable()
export class EntitlementService {
  /**
   * A null/unset plan means "internal" — this is what every existing workspace
   * has today (plan is only ever populated when environmentService.isCloud() is
   * true), so resolution must not change behavior for them.
   */
  resolvePlan(planValue: string | null | undefined): WorkionPlan {
    if (!planValue) {
      return WorkionPlan.INTERNAL;
    }
    if (KNOWN_PLANS.has(planValue)) {
      return planValue as WorkionPlan;
    }
    return MOST_RESTRICTIVE_PLAN;
  }

  hasFeature(
    planValue: string | null | undefined,
    feature: WorkionFeature,
  ): boolean {
    const plan = this.resolvePlan(planValue);
    return PLAN_FEATURES[plan].includes(feature);
  }

  getFeatures(planValue: string | null | undefined): WorkionFeature[] {
    const plan = this.resolvePlan(planValue);
    return PLAN_FEATURES[plan];
  }

  getLimits(planValue: string | null | undefined): WorkionPlanLimits {
    const plan = this.resolvePlan(planValue);
    return PLAN_LIMITS[plan];
  }
}
