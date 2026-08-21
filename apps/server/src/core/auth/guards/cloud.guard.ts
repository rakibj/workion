import { CanActivate, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

/**
 * Blocks a route everywhere except a `CLOUD=true` deployment. Gameloops runs
 * self-hosted (`isCloud() === false`), so any route behind this guard is a
 * permanent no-op there — see docs/specs/done/MULTI_TENANCY_SPEC.md.
 */
@Injectable()
export class CloudGuard implements CanActivate {
  constructor(private environmentService: EnvironmentService) {}

  canActivate(): boolean {
    return this.environmentService.isCloud();
  }
}
