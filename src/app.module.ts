import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { validateEnv } from './shared/infrastructure/config/env.validation';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { ChallengesModule } from './modules/challenges/challenges.module';
import { SchemasModule } from './modules/schemas/schemas.module';
import { TestDataModule } from './modules/test-data/test-data.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { DemoModule } from './modules/demo/demo.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    ChallengesModule,
    SchemasModule,
    TestDataModule,
    SubmissionsModule,
    EvaluationsModule,
    DemoModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
