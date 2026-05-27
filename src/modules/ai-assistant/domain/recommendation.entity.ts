import { BaseEntity } from '../../../shared/domain/base.entity';
import type {
  AiAnalysisOutput,
  AiQualityScore,
  RuleWarning,
} from '../../../shared/contracts';

export interface RecommendationProps {
  id: string;
  submissionId: string;
  explanation: string;
  suggestedIndexes: string[];
  rewriteSql: string | null;
  warnings: RuleWarning[];
  impact: string;
  qualityScore: AiQualityScore | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entidad de dominio: recomendación emitida por el asistente IA para un
 * submission. Equivale a AiAnalysisOutput (contrato 5.3) amarrado a un
 * submission concreto.
 *
 * La persistencia vive en una tabla aparte (`recommendations`) para no
 * chocar con la migración de Submission de Ruiz y para preservar histórico
 * si la submission se re-evalúa.
 */
export class Recommendation extends BaseEntity {
  submissionId: string;
  explanation: string;
  suggestedIndexes: string[];
  rewriteSql: string | null;
  warnings: RuleWarning[];
  impact: string;
  qualityScore: AiQualityScore | null;

  constructor(props: RecommendationProps) {
    super(props);
    this.submissionId = props.submissionId;
    this.explanation = props.explanation;
    this.suggestedIndexes = props.suggestedIndexes;
    this.rewriteSql = props.rewriteSql;
    this.warnings = props.warnings;
    this.impact = props.impact;
    this.qualityScore = props.qualityScore;
  }

  static fromOutput(submissionId: string, out: AiAnalysisOutput): Recommendation {
    const now = new Date();
    return new Recommendation({
      id: '', // será asignado por el repositorio cuando persistamos
      submissionId,
      explanation: out.explanation,
      suggestedIndexes: out.suggestedIndexes,
      rewriteSql: out.rewriteSql,
      warnings: out.warnings,
      impact: out.impact,
      qualityScore: out.qualityScore ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  hasCriticalWarnings(): boolean {
    return this.warnings.some((w) => w.severity === 'critical');
  }
}
