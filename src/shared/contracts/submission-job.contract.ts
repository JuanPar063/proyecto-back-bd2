/**
 * Contrato 5.1 del Plan_Entregable2 — Payload del job de submission.
 *
 * Mensaje que la API publica en la cola "submissions" cuando un STUDENT
 * envía su query. El worker carga el resto (challenge, schema, dataset,
 * query) desde Postgres usando el submissionId.
 *
 * IMPORTANTE: este archivo debe permanecer sincronizado con su gemelo en
 * worker/src/contracts/submission-job.contract.ts (el worker es un proyecto
 * TypeScript independiente y no puede importar desde src/).
 */

/** Nombre de la cola BullMQ. Debe coincidir con worker/src/main.ts. */
export const SUBMISSIONS_QUEUE_NAME = 'submissions';

/** Nombre del job dentro de la cola. */
export const EVALUATE_SUBMISSION_JOB = 'evaluate';

/** Cola para reenvío de jobs fallidos definitivamente (DLQ manual). */
export const FAILED_SUBMISSIONS_QUEUE_NAME = 'failed-submissions';

export interface SubmissionJobPayload {
  submissionId: string;
}
