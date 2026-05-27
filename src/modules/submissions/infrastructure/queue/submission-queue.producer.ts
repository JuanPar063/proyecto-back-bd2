import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { JobsOptions, Queue } from 'bullmq';
import {
  EVALUATE_SUBMISSION_JOB,
  SUBMISSIONS_QUEUE_NAME,
  SubmissionJobPayload,
} from '../../../../shared/contracts';

/**
 * Único punto de la API que publica jobs de evaluación a la cola
 * "submissions" en Redis (BullMQ). Mantenemos el productor aislado del
 * service de aplicación para:
 *
 *   - cumplir SRP: SubmissionsService orquesta dominio, el producer habla
 *     con BullMQ,
 *   - centralizar opciones del job (reintentos, retención),
 *   - facilitar mockear la cola en tests del service sin tocar BullMQ.
 *
 * El contrato del payload vive en src/shared/contracts/submission-job.contract.ts.
 */
@Injectable()
export class SubmissionQueueProducer {
  private readonly logger = new Logger(SubmissionQueueProducer.name);

  /** Opciones por defecto: 3 intentos con backoff exponencial. */
  static readonly DEFAULT_JOB_OPTIONS: JobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  };

  constructor(
    @InjectQueue(SUBMISSIONS_QUEUE_NAME)
    private readonly queue: Queue<SubmissionJobPayload>,
  ) {}

  async enqueueEvaluation(
    submissionId: string,
    overrides?: JobsOptions,
  ): Promise<void> {
    const payload: SubmissionJobPayload = { submissionId };
    const opts: JobsOptions = {
      ...SubmissionQueueProducer.DEFAULT_JOB_OPTIONS,
      ...overrides,
    };
    await this.queue.add(EVALUATE_SUBMISSION_JOB, payload, opts);
    this.logger.debug(`Submission ${submissionId} encolada (${EVALUATE_SUBMISSION_JOB})`);
  }
}
