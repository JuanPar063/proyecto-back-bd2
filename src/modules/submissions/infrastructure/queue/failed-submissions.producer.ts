import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  EVALUATE_SUBMISSION_JOB,
  FAILED_SUBMISSIONS_QUEUE_NAME,
  SUBMISSIONS_QUEUE_NAME,
  SubmissionJobPayload,
} from '../../../../shared/contracts';

/**
 * Productor / consumidor de la cola DLQ "failed-submissions".
 *
 * Estrategia:
 *   - El worker (Jose) empuja a esta cola cuando un job de "submissions"
 *     agota sus reintentos.
 *   - Esta clase expone helpers para que un admin pueda inspeccionar y
 *     reencolar manualmente a "submissions" desde el endpoint admin.
 *
 * Por qué cola separada y no `failed` interno de BullMQ:
 *   - Persistencia explícita: los jobs viven indefinidamente hasta que un
 *     humano decida descartarlos o reintentarlos.
 *   - Admin puede inspeccionar con cualquier cliente Redis.
 */
@Injectable()
export class FailedSubmissionsProducer {
  private readonly logger = new Logger(FailedSubmissionsProducer.name);

  constructor(
    @InjectQueue(FAILED_SUBMISSIONS_QUEUE_NAME)
    private readonly dlq: Queue<SubmissionJobPayload & { reason?: string }>,
    @InjectQueue(SUBMISSIONS_QUEUE_NAME)
    private readonly submissions: Queue<SubmissionJobPayload>,
  ) {}

  /** Llamado típicamente por el worker (vía adaptador) cuando un job agota retries. */
  async push(submissionId: string, reason: string): Promise<void> {
    await this.dlq.add(EVALUATE_SUBMISSION_JOB, { submissionId, reason });
    this.logger.warn(`DLQ push submission=${submissionId} reason=${reason}`);
  }

  /** Lista todos los jobs presentes en la DLQ. Usado por el admin. */
  async listFailed() {
    const jobs = await this.dlq.getJobs(['waiting', 'delayed', 'failed', 'completed']);
    return jobs.map((j) => ({
      id: j.id,
      submissionId: j.data.submissionId,
      reason: (j.data as { reason?: string }).reason ?? null,
      timestamp: j.timestamp,
    }));
  }

  /** Reencola un job desde la DLQ hacia la cola principal y elimina el original. */
  async retry(jobId: string): Promise<{ submissionId: string }> {
    const job = await this.dlq.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} no existe en la DLQ`);
    const { submissionId } = job.data;
    await this.submissions.add(EVALUATE_SUBMISSION_JOB, { submissionId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    await job.remove();
    this.logger.log(`DLQ retry submission=${submissionId} (jobId=${jobId})`);
    return { submissionId };
  }

  /** Descarta definitivamente un job de la DLQ sin reintentar. */
  async discard(jobId: string): Promise<void> {
    const job = await this.dlq.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} no existe en la DLQ`);
    await job.remove();
    this.logger.log(`DLQ discard jobId=${jobId}`);
  }
}
