import { Inject, Injectable } from '@nestjs/common';
import type {
  AiAnalysisInput,
  AiAnalysisOutput,
} from '../../../../shared/contracts';
import { Recommendation } from '../../domain/recommendation.entity';
import {
  RECOMMENDATION_REPOSITORY,
  type RecommendationRepository,
} from '../../domain/recommendation.repository';
import { AiAssistantService } from '../ai-assistant.service';

/**
 * Caso de uso: el worker recibe el resultado del runner y necesita (1)
 * generar la recomendación y (2) guardarla amarrada a la submission.
 *
 * Lo expongo como Use Case explícito (ver CONVENTIONS.md §2.1) porque
 * combina dos colaboradores y representa una acción concreta del negocio.
 *
 * Devuelve también si la submission debe marcarse como OPTIMIZATION_REQUIRED
 * para que el worker actualice el estado en una sola transacción.
 */
export interface AnalyzeAndPersistResult {
  output: AiAnalysisOutput;
  recommendation: Recommendation;
  shouldRequireOptimization: boolean;
}

@Injectable()
export class AnalyzeAndPersistUseCase {
  constructor(
    private readonly assistant: AiAssistantService,
    @Inject(RECOMMENDATION_REPOSITORY)
    private readonly repository: RecommendationRepository,
  ) {}

  async execute(
    submissionId: string,
    input: AiAnalysisInput,
  ): Promise<AnalyzeAndPersistResult> {
    const output = await this.assistant.analyze(input);
    const recommendation = await this.repository.save(
      Recommendation.fromOutput(submissionId, output),
    );
    return {
      output,
      recommendation,
      shouldRequireOptimization: this.assistant.shouldRequireOptimization(
        input,
        output,
      ),
    };
  }
}
