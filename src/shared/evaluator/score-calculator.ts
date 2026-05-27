/**
 * ============================================================
 * Calculador de score — Entrega 2 (módulo Ruiz)
 * ============================================================
 *
 * Implementa la rúbrica del enunciado:
 *
 *   Correctness (acierto)         60%
 *   Performance (tiempo)          15%
 *   Buenas prácticas              10%
 *   Claridad                       5%
 *   Mejora propuesta              10%
 *
 * Acierto y performance se calculan a partir del resultado del
 * Runner + comparador. Las otras tres dimensiones las nutre el
 * Asistente IA (Pardo); mientras Pardo no entregue, se reciben
 * como 0 y el score máximo alcanzable es 75 (60 + 15).
 *
 * Esta función es pura: sin Nest, sin Prisma, sin I/O.
 * ============================================================
 */

import type { SubmissionStatus } from '@prisma/client';

export interface AiQualityScore {
  /** 0-10: uso de buenas prácticas (índices, joins, evitar SELECT *, etc.) */
  goodPractices?: number;
  /** 0-5: claridad del SQL (formato, nombres, sub-consultas legibles). */
  clarity?: number;
  /** 0-10: calidad de la mejora propuesta (reescritura, índice, etc.). */
  improvement?: number;
}

export interface ScoreInput {
  status: SubmissionStatus;
  /** Tiempo medido por el Runner. null/undefined cuando hay error de sintaxis. */
  executionTimeMs?: number | null;
  /** timeLimit del Challenge (en ms). */
  timeLimitMs: number;
  /** Sub-score del asistente IA. Si no hay análisis, dejarlo nulo. */
  aiQualityScore?: AiQualityScore | null;
}

export interface ScoreBreakdown {
  total: number; // 0-100, entero
  correctness: number; // 0-60
  performance: number; // 0-15
  goodPractices: number; // 0-10
  clarity: number; // 0-5
  improvement: number; // 0-10
}

const MAX_CORRECTNESS = 60;
const MAX_PERFORMANCE = 15;
const MAX_GOOD_PRACTICES = 10;
const MAX_CLARITY = 5;
const MAX_IMPROVEMENT = 10;

/**
 * Performance lineal:
 *   - <= 25% del timeLimit  -> puntaje máximo (15)
 *   - >= timeLimit           -> 0
 *   - rango intermedio       -> interpolación lineal
 *
 * El 25% como zona "verde" deja margen para que la query óptima
 * y la query "buena" obtengan puntaje similar sin penalizar
 * variabilidad de hardware del runner.
 */
function performanceScore(executionTimeMs: number, timeLimitMs: number): number {
  if (timeLimitMs <= 0) return 0;
  const greenZone = timeLimitMs * 0.25;
  if (executionTimeMs <= greenZone) return MAX_PERFORMANCE;
  if (executionTimeMs >= timeLimitMs) return 0;
  const ratio = (timeLimitMs - executionTimeMs) / (timeLimitMs - greenZone);
  return Math.round(ratio * MAX_PERFORMANCE);
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Calcula el desglose del score. Importante:
 *   - Si la submission no es ACCEPTED, correctness=0 y performance=0
 *     (no tiene sentido premiar tiempo si la respuesta es incorrecta).
 *   - Si Pardo aún no entregó IA, ai* serán undefined y se truncan a 0.
 */
export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const isAccepted = input.status === 'ACCEPTED';
  const correctness = isAccepted ? MAX_CORRECTNESS : 0;

  const performance =
    isAccepted && input.executionTimeMs != null
      ? performanceScore(input.executionTimeMs, input.timeLimitMs)
      : 0;

  const ai = input.aiQualityScore ?? {};
  const goodPractices = clamp(Math.round(ai.goodPractices ?? 0), 0, MAX_GOOD_PRACTICES);
  const clarity = clamp(Math.round(ai.clarity ?? 0), 0, MAX_CLARITY);
  const improvement = clamp(Math.round(ai.improvement ?? 0), 0, MAX_IMPROVEMENT);

  const total = correctness + performance + goodPractices + clarity + improvement;
  return { total, correctness, performance, goodPractices, clarity, improvement };
}
