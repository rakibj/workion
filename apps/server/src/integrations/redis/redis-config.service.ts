import { Injectable } from '@nestjs/common';
import {
  RedisModuleOptions,
  RedisOptionsFactory,
} from '@nestjs-labs/nestjs-ioredis';
import { EnvironmentService } from '../environment/environment.service';

@Injectable()
export class RedisConfigService implements RedisOptionsFactory {
  constructor(private readonly environmentService: EnvironmentService) {}
  createRedisOptions(): RedisModuleOptions {
    return {
      readyLog: true,
      config: {
        url: this.environmentService.getRedisUrl(),
      } as any,
    };
  }
}
