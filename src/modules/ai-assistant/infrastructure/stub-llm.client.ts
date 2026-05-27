import { Injectable, Logger } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import type {
  LlmClientPort,
  LlmExplanationRequest,
  LlmExplanationResponse,
} from '../domain/llm-client.port';

/**
 * Cliente LLM determinístico. No habla con ningún proveedor: arma un texto
 * coherente a partir de las warnings y los datos del runner. Sirve para:
 *
 * - tener el pipeline completo funcionando antes de cerrar el contrato con
 *   un proveedor (OpenAI / Anthropic / Ollama),
 * - tests reproducibles sin red,
 * - demos sin API keys.
 *
 * Cuando se cablee un cliente real (ej. OpenAiLlmClient), se reemplaza este
 * provider en el AiAssistantModule y el resto del sistema no cambia.
 */
@Injectable()
export class StubLlmClient implements LlmClientPort {
  private readonly logger = new Logger(StubLlmClient.name);

  isEnabled(): boolean {
    return true;
  }

  async explain(req: LlmExplanationRequest): Promise<LlmExplanationResponse> {
    const { input, warnings } = req;
    this.logger.debug(
      `Stub LLM: status=${input.status} time=${input.executionTimeMs}ms warnings=${warnings.length}`,
    );

    const intro =
      input.status === SubmissionStatus.ACCEPTED
        ? `La consulta se ejecutó correctamente en ${input.executionTimeMs} ms.`
        : `La consulta terminó con estado ${input.status} en ${input.executionTimeMs} ms.`;

    const observations = warnings.length
      ? warnings.map((w) => `• ${w.message}`).join('\n')
      : '• No se detectaron malas prácticas estructurales en la consulta.';

    const closing =
      warnings.some((w) => w.severity === 'critical')
        ? 'Hay al menos un punto crítico: priorízalo antes de la próxima entrega.'
        : 'Mantén las buenas prácticas en próximas iteraciones.';

    return {
      explanation: `${intro}\n\nObservaciones:\n${observations}\n\n${closing}`,
      rewriteSql: null,
    };
  }
}
