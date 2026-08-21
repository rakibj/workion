import { SetMetadata } from '@nestjs/common';
import { WorkionFeature } from './entitlement';

export const REQUIRE_FEATURE_KEY = 'workionRequireFeature';

export const RequireFeature = (feature: WorkionFeature) =>
  SetMetadata(REQUIRE_FEATURE_KEY, feature);
