/**
 * ============================================================
 * Espejo de src/shared/evaluator/score-calculator.ts
 * ============================================================
 *
 * Misma lógica de scoring que la versión de la API. Sincronizar
 * ambas copias manualmente — los tests canónicos viven en
 * src/shared/evaluator/score-calculator.spec.ts.
 * ============================================================
 */

import type { SubmissionStatus } from '@prisma/client';

export interface AiQualityScore {
  goodPractices?: number;
  clarity?: number;
  improvement?: number;
}

export interface ScoreInput {
  status: SubmissionStatus;
  executionTimeMs?: number | null;
  timeLimitMs: number;
  aiQualityScore?: AiQualityScore | null;
}

export interface ScoreBreakdown {
  total: number;
  correctness: number;
  performance: number;
  goodPractices: number;
  clarity: number;
  improvement: number;
}

const MAX_CORRECTNESS = 60;
const MAX_PERFORMANCE = 15;
const MAX_GOOD_PRACTICES = 10;
const MAX_CLARITY = 5;
const MAX_IMPROVEMENT = 10;

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
