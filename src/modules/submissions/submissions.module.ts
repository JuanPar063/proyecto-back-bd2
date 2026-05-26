import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubmissionsController } from './presentation/submissions.controller';
import { ChallengeSubmissionsController } from './presentation/challenge-submissions.controller';
import { ChallengeExpectedResultController } from './presentation/challenge-expected-result.controller';
import {
  SubmissionsService,
  SUBMISSIONS_QUEUE,
} from './application/submissions.service';

/**
 * Módulo de submissions.
 *
 * Controllers:
 *  - SubmissionsController                  (/submissions/*)
 *  - ChallengeSubmissionsController         (POST /challenges/:challengeId/submissions)
 *  - ChallengeExpectedResultController      (/challenges/:challengeId/expected-result)
 *
 * El nombre de la cola SUBMISSIONS_QUEUE = 'submissions' debe coincidir
 * con worker/src/main.ts (ya lo hace — usa la constante exportada).
 */
@Module({
  imports: [BullModule.registerQueue({ name: SUBMISSIONS_QUEUE })],
  controllers: [
    SubmissionsController,
    ChallengeSubmissionsController,
    ChallengeExpectedResultController,
  ],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
