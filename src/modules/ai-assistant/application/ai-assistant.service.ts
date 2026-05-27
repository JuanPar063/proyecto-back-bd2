import { Inject, Injectable, Logger } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import type {
  AiAnalysisInput,
  AiAnalysisOutput,
} from '../../../shared/contracts';
import type { AiAssistantPort } from '../domain/ai-assistant.port';
import {
  LLM_CLIENT_PORT,
  type LlmClientPort,
} from '../domain/llm-client.port';
import { RecommendationBuilderService } from './recommendation-builder.service';
import { RuleEngineService } from './rule-engine.service';

/**
 * Devuelve `true` si la submission debe marcarse como OPTIMIZATION_REQUIRED.
 *
 * Regla actual: la query fue ACCEPTED por el comparador PERO el motor de
 * reglas levantó al menos una alerta `critical` (típicamente SLOW_QUERY o
 * CROSS_JOIN). Es función pura para que el worker la consuma sin instanciar
 * Nest, y para mantener la decisión auditable en un solo lugar.
 *
 * Si la query es WRONG_ANSWER el estudiante debe arreglar correctness antes;
 * no le forzamos OPTIMIZATION_REQUIRED encima.
 */
export function shouldRequireOptimization(
  input: AiAnalysisInput,
  output: AiAnalysisOutput,
): boolean {
  if (input.status !== SubmissionStatus.ACCEPTED) return false;
  return output.warnings.some((w) => w.severity === 'critical');
}

/**
 * Punto de entrada del módulo: implementa AiAssistantPort. Es lo que el
 * worker (Jose) consume después de evaluar una submission, y también lo que
 * expone el controller interno para pruebas manuales.
 *
 * Enfoque elegido (ADR-010 del proyecto): híbrido.
 *   1. RuleEngineService detecta patrones SQL costosos (rápido, sin red).
 *   2. LlmClientPort redacta la explicación (puede ser stub o proveedor real).
 *   3. RecommendationBuilderService ensambla la salida final.
 */
@Injectable()
export class AiAssistantService implements AiAssistantPort {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly ruleEngine: RuleEngineService,
    private readonly builder: RecommendationBuilderService,
    @Inject(LLM_CLIENT_PORT) private readonly llm: LlmClientPort,
  ) {}

  async analyze(input: AiAnalysisInput): Promise<AiAnalysisOutput> {
    const warnings = this.ruleEngine.evaluate(input);
    this.logger.debug(
      `analyze status=${input.status} time=${input.executionTimeMs}ms warnings=${warnings.length}`,
    );

    const llmResponse = this.llm.isEnabled()
      ? await this.llm.explain({ input, warnings })
      : { explanation: this.fallbackExplanation(input, warnings.length), rewriteSql: null };

    return this.builder.build(input, warnings, llmResponse);
  }

  /** Atajo expuesto como método para que el worker no tenga que importar la función suelta. */
  shouldRequireOptimization(input: AiAnalysisInput, output: AiAnalysisOutput): boolean {
    return shouldRequireOptimization(input, output);
  }

  private fallbackExplanation(input: AiAnalysisInput, warningsCount: number): string {
    return `Ejecución en ${input.executionTimeMs} ms con ${warningsCount} alerta(s). LLM deshabilitado.`;
  }
}
