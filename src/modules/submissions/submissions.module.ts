import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FAILED_SUBMISSIONS_QUEUE_NAME } from '../../shared/contracts';
import { SubmissionsController } from './presentation/submissions.controller';
import { ChallengeSubmissionsController } from './presentation/challenge-submissions.controller';
import { ChallengeExpectedResultController } from './presentation/challenge-expected-result.controller';
import { AdminSubmissionsController } from './presentation/admin-submissions.controller';
import {
  SubmissionsService,
  SUBMISSIONS_QUEUE,
} from './application/submissions.service';
import { FailedSubmissionsProducer } from './infrastructure/queue/failed-submissions.producer';

/**
 * Módulo de submissions.
 *
 * Controllers:
 *  - SubmissionsController                  (/submissions/*)
 *  - ChallengeSubmissionsController         (POST /challenges/:challengeId/submissions)
 *  - ChallengeExpectedResultController      (/challenges/:challengeId/expected-result)
 *  - AdminSubmissionsController             (/admin/submissions/failed/*) — DLQ admin (ADMIN only)
 *
 * Colas:
 *  - SUBMISSIONS_QUEUE ('submissions') — cola principal, debe coincidir con
 *    worker/src/main.ts (ya lo hace, usa la misma constante).
 *  - FAILED_SUBMISSIONS_QUEUE_NAME ('failed-submissions') — DLQ manual. El
 *    worker empuja jobs muertos aquí; ADMIN puede reintentarlos o
 *    descartarlos vía AdminSubmissionsController.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: SUBMISSIONS_QUEUE },
      { name: FAILED_SUBMISSIONS_QUEUE_NAME },
    ),
  ],
  controllers: [
    SubmissionsController,
    ChallengeSubmissionsController,
    ChallengeExpectedResultController,
    AdminSubmissionsController,
  ],
  providers: [SubmissionsService, FailedSubmissionsProducer],
  exports: [SubmissionsService, FailedSubmissionsProducer],
})
export class SubmissionsModule {}
