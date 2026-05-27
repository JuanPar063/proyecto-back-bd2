/**
 * Contrato 5.3 del Plan_Entregable2 — Input/Output del Asistente IA.
 *
 * Alineado con `docs/CONTRACTS.md` (sección 3) que mantiene Ruiz.
 *
 * El Worker, después de evaluar la submission (runner + comparador), le
 * pasa estos datos al asistente para que genere recomendaciones de
 * optimización y aporte sub-scores a la rúbrica.
 *
 * IMPORTANTE: debe permanecer sincronizado con su gemelo en
 * worker/src/contracts/ai-assistant.contract.ts.
 */

import type { SubmissionStatus } from '@prisma/client';

export interface AiAnalysisInput {
  /** Query SQL enviada por el estudiante (tal cual, sin normalizar). */
  query: string;
  /** DDL del reto (CREATE TABLE …). Sirve para detectar columnas/índices. */
  schemaDdl: string;
  /** Tiempo de ejecución medido por el runner. */
  executionTimeMs: number;
  /** EXPLAIN del motor; null si el runner no lo capturó. */
  explainPlan: string | null;
  /**
   * Estado final ya derivado por el worker (`deriveStatus`):
   * ACCEPTED, WRONG_ANSWER, SYNTAX_ERROR, TIME_LIMIT_EXCEEDED, RUNTIME_ERROR.
   * El asistente lo usa para modular el feedback (no es lo mismo dar
   * recomendaciones sobre un ACCEPTED que sobre un SYNTAX_ERROR).
   */
  status: SubmissionStatus;
}

/**
 * Sub-scores que consume `score-calculator.ts` (Ruiz) para las dimensiones
 * 3, 4 y 5 de la rúbrica del Plan_Entregable2 (sección 6 de CONTRACTS.md).
 *
 *   - goodPractices  → 0-10
 *   - clarity        → 0-5
 *   - improvement    → 0-10
 *
 * Los tres son opcionales: si no se entregan, el calculador asume 0 y el
 * score total queda en 75 max (60 correctness + 15 performance).
 */
export interface AiQualityScore {
  goodPractices?: number;
  clarity?: number;
  improvement?: number;
}

/** Una advertencia detectada por el motor de reglas (extensión sobre `docs/CONTRACTS.md`). */
export interface RuleWarning {
  /** Identificador de la regla (ej. SELECT_STAR, FUNCTION_IN_WHERE). */
  ruleId: string;
  /** Severidad para priorizar en UI y para decidir OPTIMIZATION_REQUIRED. */
  severity: 'info' | 'warning' | 'critical';
  /** Mensaje legible para el estudiante. */
  message: string;
}

export interface AiAnalysisOutput {
  /** Explicación en lenguaje natural (1-3 párrafos). */
  explanation: string;
  /** Índices sugeridos como sentencias CREATE INDEX listas para copiar. */
  suggestedIndexes: string[];
  /** Versión reescrita de la query, o null si no aplica. */
  rewriteSql: string | null;
  /**
   * Warnings concretas del motor de reglas.
   *
   * NOTA: `docs/CONTRACTS.md` documenta `warnings: string[]`. Esta es una
   * extensión estrictamente más rica (incluye severity + ruleId) acordada
   * con el equipo: un consumidor que solo necesite strings puede mapear
   * `warnings.map(w => w.message)`. La severidad la consume internamente
   * `shouldRequireOptimization` para marcar OPTIMIZATION_REQUIRED.
   */
  warnings: RuleWarning[];
  /** Resumen del impacto esperado (ej. "Reduce de 1200ms a ~150ms"). */
  impact: string;
  /** Sub-scores para la rúbrica del score-calculator de Ruiz. */
  qualityScore?: AiQualityScore;
}

// =============================================================================
// Aliases legados — mantener mientras el resto del código se renombra.
// Cuando todo el módulo ai-assistant migre a los nombres nuevos, borrar.
// =============================================================================
/** @deprecated usar AiAnalysisInput */
export type AiAssistantInput = AiAnalysisInput;
/** @deprecated usar AiAnalysisOutput */
export type AiAssistantOutput = AiAnalysisOutput;
