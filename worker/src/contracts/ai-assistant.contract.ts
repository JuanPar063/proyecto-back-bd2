/**
 * Espejo del contrato 5.3 del Plan_Entregable2.
 *
 * MANTENER SINCRONIZADO con src/shared/contracts/ai-assistant.contract.ts.
 * Alineado con `docs/CONTRACTS.md` (sección 3) de Ruiz.
 */

import type { SubmissionStatus } from '@prisma/client';

export interface AiAnalysisInput {
  query: string;
  schemaDdl: string;
  executionTimeMs: number;
  explainPlan: string | null;
  status: SubmissionStatus;
}

export interface AiQualityScore {
  goodPractices?: number;
  clarity?: number;
  improvement?: number;
}

export interface RuleWarning {
  ruleId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface AiAnalysisOutput {
  explanation: string;
  suggestedIndexes: string[];
  rewriteSql: string | null;
  warnings: RuleWarning[];
  impact: string;
  qualityScore?: AiQualityScore;
}
