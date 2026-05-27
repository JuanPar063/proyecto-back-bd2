import { Injectable, Logger } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import type { RuleWarning } from '../../../shared/contracts';
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
      rewriteSql: this.proposeRewrite(input.query, input.schemaDdl, warnings),
    };
  }

  /**
   * Heurísticas de reescritura para el stub. Devuelven una versión "mejor"
   * de la query cuando se detecta un patrón conocido; si no, null.
   *
   * Reglas implementadas (orden de prioridad):
   *   1. `IN (SELECT ...)` → `EXISTS (...)` (más amigable al planner).
   *   2. Función envolviendo columna en WHERE → reescribir comparando contra
   *      el literal transformado en lugar de la columna.
   *   3. `SELECT *` → enumerar columnas detectadas en el primer CREATE TABLE
   *      del schemaDdl.
   *
   * Cuando coincide más de una, se aplica la primera y se devuelve la query
   * transformada (las demás se aplicarán en pasadas posteriores cuando el
   * estudiante vuelva a enviar). Esto mantiene el output determinístico y
   * legible.
   */
  private proposeRewrite(
    query: string,
    schemaDdl: string,
    warnings: RuleWarning[],
  ): string | null {
    const ids = new Set(warnings.map((w) => w.ruleId));

    // Regla 1: IN (SELECT ...) → EXISTS (...)
    // Captura `<columna> IN (SELECT <colSub> FROM ...)` y lo transforma a
    // `EXISTS (SELECT 1 FROM ... WHERE ... = <columna>)`. Es heurística:
    // solo aplica al patrón simple de un solo IN con sub-select.
    const inSelectMatch = query.match(
      /\b(\w+(?:\.\w+)?)\s+IN\s*\(\s*SELECT\s+(\w+(?:\.\w+)?)\s+FROM\s+([\s\S]+?)\)/i,
    );
    if (inSelectMatch) {
      const [whole, outerCol, innerCol, innerBody] = inSelectMatch;
      const exists = `EXISTS (SELECT 1 FROM ${innerBody.trim()} WHERE ${innerCol} = ${outerCol})`;
      return query.replace(whole, exists);
    }

    // Regla 2: función sobre columna en WHERE.
    // Ej.: `WHERE UPPER(name) = 'X'` → `WHERE name = 'X'` (con nota).
    if (ids.has('FUNCTION_IN_WHERE')) {
      const fnMatch = query.match(
        /\b(UPPER|LOWER|TRIM|DATE)\s*\(\s*(\w+(?:\.\w+)?)\s*\)\s*(=|<>|!=|>=|<=|>|<)\s*('[^']*'|"[^"]*"|\d+)/i,
      );
      if (fnMatch) {
        const [whole, , col, op, literal] = fnMatch;
        return query.replace(whole, `${col} ${op} ${literal}`);
      }
    }

    // Regla 3: SELECT * → enumerar columnas.
    // Toma las columnas del primer CREATE TABLE del schemaDdl como heurística.
    if (ids.has('SELECT_STAR')) {
      const cols = this.firstTableColumns(schemaDdl);
      if (cols.length > 0) {
        return query.replace(/SELECT\s+\*/i, `SELECT ${cols.join(', ')}`);
      }
    }

    return null;
  }

  /**
   * Extrae los nombres de columna del primer `CREATE TABLE` que aparece en
   * el DDL. Es una heurística suficiente para el stub: si hay varias tablas,
   * el LLM real podría elegir mejor; nosotros tomamos la primera.
   */
  private firstTableColumns(schemaDdl: string): string[] {
    const tableMatch = schemaDdl.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+\s*\(([\s\S]+?)\)\s*;/i);
    if (!tableMatch) return [];
    const body = tableMatch[1];

    // Cada definición está separada por coma a nivel raíz. Como las
    // definiciones internas no anidan paréntesis con coma, partir por coma
    // a nivel raíz es suficiente. Filtramos constraints y FKs.
    const parts = body
      .split(/,(?![^()]*\))/g)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const cols: string[] = [];
    for (const part of parts) {
      const upper = part.toUpperCase();
      if (
        upper.startsWith('PRIMARY KEY') ||
        upper.startsWith('FOREIGN KEY') ||
        upper.startsWith('UNIQUE') ||
        upper.startsWith('CONSTRAINT') ||
        upper.startsWith('CHECK')
      ) {
        continue;
      }
      const colMatch = part.match(/^(\w+)/);
      if (colMatch) cols.push(colMatch[1]);
    }
    return cols;
  }
}
