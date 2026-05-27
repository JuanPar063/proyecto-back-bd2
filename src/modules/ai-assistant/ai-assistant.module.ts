import { Module } from '@nestjs/common';
import { AiAssistantService } from './application/ai-assistant.service';
import { RecommendationBuilderService } from './application/recommendation-builder.service';
import { RuleEngineService } from './application/rule-engine.service';
import { AnalyzeAndPersistUseCase } from './application/use-cases/analyze-and-persist.use-case';
import { AI_ASSISTANT_PORT } from './domain/ai-assistant.port';
import { LLM_CLIENT_PORT } from './domain/llm-client.port';
import { RECOMMENDATION_REPOSITORY } from './domain/recommendation.repository';
import { PrismaRecommendationRepository } from './infrastructure/prisma-recommendation.repository';
import { StubLlmClient } from './infrastructure/stub-llm.client';
import { AiAssistantController } from './presentation/ai-assistant.controller';

/**
 * Módulo del asistente inteligente (Pardo, Entrega 2).
 *
 * Composición:
 *   - RuleEngineService: motor de reglas SQL puro (sin red).
 *   - RecommendationBuilderService: ensambla la salida final.
 *   - StubLlmClient: implementación temporal del LLM (determinística).
 *   - AiAssistantService: orquesta los tres anteriores y cumple AiAssistantPort.
 *
 * Para cambiar a un proveedor real (OpenAI / Anthropic / Ollama) se sustituye
 * el provider de LLM_CLIENT_PORT por la implementación correspondiente.
 *
 * El módulo exporta el puerto (AI_ASSISTANT_PORT + AiAssistantService) para
 * que otros módulos —y eventualmente el worker, vía adaptador— lo consuman.
 */
@Module({
  controllers: [AiAssistantController],
  providers: [
    RuleEngineService,
    RecommendationBuilderService,
    StubLlmClient,
    { provide: LLM_CLIENT_PORT, useExisting: StubLlmClient },
    PrismaRecommendationRepository,
    {
      provide: RECOMMENDATION_REPOSITORY,
      useExisting: PrismaRecommendationRepository,
    },
    AiAssistantService,
    { provide: AI_ASSISTANT_PORT, useExisting: AiAssistantService },
    AnalyzeAndPersistUseCase,
  ],
  exports: [
    AiAssistantService,
    AI_ASSISTANT_PORT,
    AnalyzeAndPersistUseCase,
    RECOMMENDATION_REPOSITORY,
  ],
})
export class AiAssistantModule {}
