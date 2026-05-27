/**
 * Espejo del contrato 5.2 del Plan_Entregable2.
 *
 * MANTENER SINCRONIZADO con src/shared/contracts/runner-result.contract.ts.
 */

export type RunnerStatus =
  | 'OK'
  | 'SYNTAX_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIMEOUT';

export interface RunnerResult {
  status: RunnerStatus;
  executionTimeMs: number;
  rows: unknown[][];
  columns: string[];
  errorMessage: string | null;
  explainPlan: string | null;
}
