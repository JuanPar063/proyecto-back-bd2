import { Injectable } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import type {
  AiAnalysisInput,
  AiAnalysisOutput,
  AiQualityScore,
  RuleWarning,
} from '../../../shared/contracts';
import type { LlmExplanationResponse } from '../domain/llm-client.port';

/** Estados que indican que la query al menos LLEGÓ A EJECUTARSE en el motor. */
const RAN_STATUSES = new Set<SubmissionStatus>([
  SubmissionStatus.ACCEPTED,
  SubmissionStatus.WRONG_ANSWER,
  SubmissionStatus.OPTIMIZATION_REQUIRED,
]);

/**
 * Ensambla la salida final del asistente IA a partir de:
 *   - las warnings del motor de reglas,
 *   - la respuesta del LLM (o el stub),
 *   - el input crudo del runner.
 *
 * El builder es la única pieza que conoce la forma final del AiAnalysisOutput.
 */
@Injectable()
export class RecommendationBuilderService {
  build(
    input: AiAnalysisInput,
    warnings: RuleWarning[],
    llm: LlmExplanationResponse,
  ): AiAnalysisOutput {
    return {
      explanation: llm.explanation,
      suggestedIndexes: this.suggestIndexes(input, warnings),
      rewriteSql: llm.rewriteSql,
      warnings,
      impact: this.summarizeImpact(input, warnings),
      qualityScore: this.computeQualityScore(input, warnings),
    };
  }

  /**
   * Heurística mínima para Sprint 1: si vemos FUNCTION_IN_WHERE, sugerimos
   * mirar índices funcionales; si vemos ORDER_BY_WITHOUT_LIMIT, sugerimos
   * un índice sobre la(s) columna(s) ordenadas. La lista concreta de
   * sentencias CREATE INDEX se completará cuando tengamos parser de schema
   * (depende de Ruiz: parsedTables ya está reservado en SchemaScript).
   */
  private suggestIndexes(
    _input: AiAnalysisInput,
    warnings: RuleWarning[],
  ): string[] {
    const suggestions: string[] = [];
    if (warnings.some((w) => w.ruleId === 'FUNCTION_IN_WHERE')) {
      suggestions.push(
        '-- Considera un índice funcional (ej. CREATE INDEX ON tabla (LOWER(columna)))',
      );
    }
    if (warnings.some((w) => w.ruleId === 'ORDER_BY_WITHOUT_LIMIT')) {
      suggestions.push(
        '-- Considera un índice sobre la columna usada en ORDER BY para evitar el sort completo',
      );
    }
    if (warnings.some((w) => w.ruleId === 'MISSING_WHERE')) {
      suggestions.push(
        '-- Si el reto admite filtros, agrega un índice sobre la columna del WHERE para evitar el seq scan',
      );
    }
    return suggestions;
  }

  private summarizeImpact(
    input: AiAnalysisInput,
    warnings: RuleWarning[],
  ): string {
    if (!RAN_STATUSES.has(input.status)) {
      return `La consulta no completó con éxito (status ${input.status}). Corrige el error antes de optimizar.`;
    }
    if (input.status === SubmissionStatus.WRONG_ANSWER) {
      return 'La consulta corrió pero el resultado no coincide con el esperado. Prioriza la correctness antes que la optimización.';
    }
    const criticals = warnings.filter((w) => w.severity === 'critical').length;
    if (criticals > 0) {
      return `Hay ${criticals} alerta(s) crítica(s): atender estos puntos suele reducir el tiempo de ejecución de forma notable.`;
    }
    if (warnings.length === 0) {
      return 'No se detectaron oportunidades obvias de optimización. Sigue así.';
    }
    return `Aplicar las ${warnings.length} sugerencia(s) puede mejorar la legibilidad y el plan de ejecución.`;
  }

  /**
   * Sub-scores que consume `score-calculator.ts` (Ruiz). Topes:
   *   - goodPractices  ≤ 10
   *   - clarity        ≤  5
   *   - improvement    ≤ 10
   *
   * Heurística:
   *   - goodPractices: parte de 10. -5 por cada warning critical, -2 por warning,
   *     0 por info. Clamp a [0, 10].
   *   - clarity: parte de 5. -2 si hay SELECT_STAR, -1 si hay JOIN_WITHOUT_ON,
   *     -1 si hay FUNCTION_IN_WHERE. Clamp a [0, 5].
   *   - improvement: 10 si ACCEPTED sin warnings; 5 si ACCEPTED con warnings
   *     no críticos; 0 si hay crítico o si no es ACCEPTED.
   *
   * Si la query no llegó a ejecutarse (SYNTAX/RUNTIME/TIMEOUT), las tres
   * dimensiones son 0 — no hay base de evidencia para puntuar buenas prácticas
   * sobre código que no corrió.
   */
  private computeQualityScore(
    input: AiAnalysisInput,
    warnings: RuleWarning[],
  ): AiQualityScore {
    if (!RAN_STATUSES.has(input.status)) {
      return { goodPractices: 0, clarity: 0, improvement: 0 };
    }

    let goodPractices = 10;
    for (const w of warnings) {
      if (w.severity === 'critical') goodPractices -= 5;
      else if (w.severity === 'warning') goodPractices -= 2;
    }
    goodPractices = clamp(goodPractices, 0, 10);

    let clarity = 5;
    if (warnings.some((w) => w.ruleId === 'SELECT_STAR')) clarity -= 2;
    if (warnings.some((w) => w.ruleId === 'JOIN_WITHOUT_ON')) clarity -= 1;
    if (warnings.some((w) => w.ruleId === 'FUNCTION_IN_WHERE')) clarity -= 1;
    clarity = clamp(clarity, 0, 5);

    let improvement: number;
    if (input.status !== SubmissionStatus.ACCEPTED) {
      improvement = 0;
    } else if (warnings.some((w) => w.severity === 'critical')) {
      improvement = 0;
    } else if (warnings.length === 0) {
      improvement = 10;
    } else {
      improvement = 5;
    }

    return { goodPractices, clarity, improvement };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
