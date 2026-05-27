/**
 * Espejo del contrato 5.1 del Plan_Entregable2.
 *
 * MANTENER SINCRONIZADO con src/shared/contracts/submission-job.contract.ts.
 * El worker es un proyecto TypeScript independiente (rootDir = worker/src),
 * por lo que no puede importar desde src/. Si cambias uno, cambia el otro.
 */

export const SUBMISSIONS_QUEUE_NAME = 'submissions';
export const EVALUATE_SUBMISSION_JOB = 'evaluate';
export const FAILED_SUBMISSIONS_QUEUE_NAME = 'failed-submissions';

export interface SubmissionJobPayload {
  submissionId: string;
}
