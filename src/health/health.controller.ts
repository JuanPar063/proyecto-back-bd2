import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.checkPostgres(),
      () => this.checkRedis(),
    ]);
  }

  private async checkPostgres(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { postgres: { status: 'up' } };
    } catch (err) {
      return { postgres: { status: 'down', message: (err as Error).message } };
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'redis'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await redis.connect();
      await redis.ping();
      return { redis: { status: 'up' } };
    } catch (err) {
      return { redis: { status: 'down', message: (err as Error).message } };
    } finally {
      redis.disconnect();
    }
  }
}
