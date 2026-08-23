import { Global, Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { UsageLimitService } from './usage-limit.service';

@Global()
@Module({
  providers: [EntitlementService, UsageLimitService],
  exports: [EntitlementService, UsageLimitService],
})
export class EntitlementModule {}
