/**
 * Contrato 5.2 del Plan_Entregable2 — Resultado del Runner SQL.
 *
 * Lo que el Runner Docker (responsabilidad de Jose) devuelve al Worker
 * después de ejecutar la query del estudiante en un contenedor aislado.
 *
 * IMPORTANTE: debe permanecer sincronizado con su gemelo en
 * worker/src/contracts/runner-result.contract.ts.
 */

export type RunnerStatus =
  | 'OK'
  | 'SYNTAX_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIMEOUT';

export interface RunnerResult {
  status: RunnerStatus;
  /** Tiempo de ejecución medido dentro del contenedor (ms). */
  executionTimeMs: number;
  /** Filas devueltas por la query. Vacío si hubo error. */
  rows: unknown[][];
  /** Nombres de columnas en el orden devuelto por el motor. */
  columns: string[];
  /** Mensaje crudo del motor SQL si status !== 'OK'. */
  errorMessage: string | null;
  /** Output de EXPLAIN ANALYZE. Insumo opcional del asistente IA. */
  explainPlan: string | null;
}
