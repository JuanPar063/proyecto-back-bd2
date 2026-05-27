import type { AiAnalysisInput, RuleWarning } from '../../../shared/contracts';

/**
 * Puerto para el cliente de modelos de lenguaje. La implementación concreta
 * (stub determinístico, OpenAI, Claude, Ollama, …) vive en infrastructure/.
 * Esto evita que la capa de aplicación dependa del proveedor.
 */
export const LLM_CLIENT_PORT = Symbol('LLM_CLIENT_PORT');

export interface LlmExplanationRequest {
  input: AiAnalysisInput;
  warnings: RuleWarning[];
}

export interface LlmExplanationResponse {
  explanation: string;
  /** Reescritura opcional sugerida por el modelo. null si no aplica. */
  rewriteSql: string | null;
}

export interface LlmClientPort {
  explain(req: LlmExplanationRequest): Promise<LlmExplanationResponse>;
  /** Permite a la capa de aplicación saber si el LLM está habilitado. */
  isEnabled(): boolean;
}
