import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementService } from './entitlement.service';
import { WorkionFeature } from './entitlement';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementService: EntitlementService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<WorkionFeature>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const workspace = request.raw?.workspace ?? request?.user?.workspace;

    if (
      !workspace ||
      !this.entitlementService.hasFeature(workspace.plan, feature)
    ) {
      throw new ForbiddenException(
        'This feature is not available on the current plan',
      );
    }

    return true;
  }
}
