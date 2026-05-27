import type {
  AiAnalysisInput,
  AiAnalysisOutput,
} from '../../../shared/contracts';

/**
 * Puerto del asistente IA. Es lo que el Worker (Jose) consumirá para pedir
 * recomendaciones después de evaluar una submission. El contrato I/O vive en
 * src/shared/contracts/ai-assistant.contract.ts (sección 5.3 del Plan).
 *
 * La implementación de aplicación (AiAssistantService) decide internamente
 * si la respuesta sale solo de reglas, solo del LLM, o de un híbrido.
 */
export const AI_ASSISTANT_PORT = Symbol('AI_ASSISTANT_PORT');

export interface AiAssistantPort {
  analyze(input: AiAnalysisInput): Promise<AiAnalysisOutput>;
}
