import { Test } from '@nestjs/testing';
import { EntitlementService } from './entitlement.service';
import { WorkionFeature, WorkionPlan } from './entitlement';

describe('EntitlementService', () => {
  let service: EntitlementService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [EntitlementService],
    }).compile();

    service = module.get(EntitlementService);
  });

  describe('resolvePlan', () => {
    it('resolves null to internal', () => {
      expect(service.resolvePlan(null)).toBe(WorkionPlan.INTERNAL);
    });

    it('resolves undefined to internal', () => {
      expect(service.resolvePlan(undefined)).toBe(WorkionPlan.INTERNAL);
    });

    it('resolves empty string to internal', () => {
      expect(service.resolvePlan('')).toBe(WorkionPlan.INTERNAL);
    });

    it('resolves a known plan value as-is', () => {
      expect(service.resolvePlan('pro')).toBe(WorkionPlan.PRO);
    });

    it('fails safe to the most restrictive plan for an unknown value', () => {
      expect(service.resolvePlan('not-a-real-plan')).toBe(WorkionPlan.FREE);
    });
  });

  describe('hasFeature', () => {
    it('grants every feature to an internal (null-plan) workspace', () => {
      expect(service.hasFeature(null, WorkionFeature.BLOG)).toBe(true);
    });

    it('denies a feature not included in a restricted plan', () => {
      expect(service.hasFeature(WorkionPlan.FREE, WorkionFeature.BLOG)).toBe(
        false,
      );
    });

    it('denies features for an unrecognized plan value', () => {
      expect(service.hasFeature('garbage', WorkionFeature.BLOG)).toBe(false);
    });
  });

  describe('getLimits', () => {
    it('returns unlimited (null) limits for an internal workspace', () => {
      expect(service.getLimits(null)).toEqual({
        clients: null,
        users: null,
        domains: null,
      });
    });

    it('returns the configured limits for a restricted plan', () => {
      expect(service.getLimits(WorkionPlan.FREE)).toEqual({
        clients: 1,
        users: 3,
        domains: 0,
      });
    });

    it('returns the most-restrictive-plan limits for an unrecognized value', () => {
      expect(service.getLimits('garbage')).toEqual(
        service.getLimits(WorkionPlan.FREE),
      );
    });
  });
});
