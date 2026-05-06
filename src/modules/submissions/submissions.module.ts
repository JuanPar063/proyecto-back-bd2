import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubmissionsController } from './presentation/submissions.controller';
import { SubmissionsService, SUBMISSIONS_QUEUE } from './application/submissions.service';

/**
 * Módulo de submissions
 * El nombre de la cola SUBMISSIONS_QUEUE = 'submissions' debe coincidir
 * con el worker/src/main.ts (ya lo hace — usa la misma constante exportada).
 */
@Module({
  imports: [
    // Registra el producer de la cola.
    // La conexión Redis viene del BullModule.forRootAsync en app.module.ts
    BullModule.registerQueue({ name: SUBMISSIONS_QUEUE }),
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
