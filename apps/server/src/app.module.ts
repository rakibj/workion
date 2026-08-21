import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvironmentService } from './integrations/environment/environment.service';
import { AuditActorInterceptor } from './common/interceptors/audit-actor.interceptor';
import { CoreModule } from './core/core.module';
import { EnvironmentModule } from './integrations/environment/environment.module';
import { EntitlementModule } from './common/entitlement/entitlement.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { WsModule } from './ws/ws.module';
import { DatabaseModule } from '@docmost/db/database.module';
import { StorageModule } from './integrations/storage/storage.module';
import { MailModule } from './integrations/mail/mail.module';
import { QueueModule } from './integrations/queue/queue.module';
import { StaticModule } from './integrations/static/static.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './integrations/health/health.module';
import { ExportModule } from './integrations/export/export.module';
import { ImportModule } from './integrations/import/import.module';
import { SecurityModule } from './integrations/security/security.module';
import { TelemetryModule } from './integrations/telemetry/telemetry.module';
import { RedisModule } from '@nestjs-labs/nestjs-ioredis';
import { RedisConfigService } from './integrations/redis/redis-config.service';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { LoggerModule } from './common/logger/logger.module';
import { ClsModule } from 'nestjs-cls';
import { NoopAuditModule } from './integrations/audit/audit.module';
import { ThrottleModule } from './integrations/throttle/throttle.module';

// apps/server/src/ee/ is an optional plugin directory (see CLAUDE.md) that
// does not exist in this fork. Multi-tenancy's cloud signup flow
// (docs/specs/done/MULTI_TENANCY_SPEC.md) doesn't depend on it, so a missing EE module
// is not fatal in any deployment mode — self-hosted or cloud.
const enterpriseModules = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const eeModule = require('./ee/ee.module');
  if (eeModule?.EeModule) {
    enterpriseModules.push(eeModule.EeModule);
  }
} catch {
  // no-op: EE modules are optional everywhere.
}

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    LoggerModule,
    NoopAuditModule,
    CoreModule,
    DatabaseModule,
    EnvironmentModule,
    EntitlementModule,
    RedisModule.forRootAsync({
      useClass: RedisConfigService,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (environmentService: EnvironmentService) => {
        const redisUrl = environmentService.getRedisUrl();

        return {
          ttl: 5 * 1000,
          stores: [new KeyvRedis(redisUrl)],
        };
      },
      inject: [EnvironmentService],
    }),
    CollaborationModule,
    WsModule,
    QueueModule,
    StaticModule,
    HealthModule,
    ImportModule,
    ExportModule,
    StorageModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    MailModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    EventEmitterModule.forRoot(),
    SecurityModule,
    TelemetryModule,
    ThrottleModule,
    ...enterpriseModules,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditActorInterceptor,
    },
  ],
})
export class AppModule {}
