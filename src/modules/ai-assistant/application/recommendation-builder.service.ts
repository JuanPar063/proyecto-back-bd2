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
   * Sugiere sentencias `CREATE INDEX` reales (no comentarios) a partir del
   * `schemaDdl` del reto y la `query` enviada por el estudiante.
   *
   * Algoritmo:
   *   1. Parsear `schemaDdl` para obtener `tabla → set<columna>`.
   *   2. Detectar columnas mencionadas en WHERE / JOIN ... ON / ORDER BY del
   *      `query` y resolver a qué tabla pertenecen.
   *   3. Emitir `CREATE INDEX idx_<tabla>_<col> ON <tabla>(<col>);` por cada
   *      par (tabla, columna) único.
   *   4. Si hay `FUNCTION_IN_WHERE`, agregar un índice funcional para
   *      cubrir el caso `LOWER(col)`, `UPPER(col)`, etc.
   *
   * Heurística — el LLM real puede ser más preciso, pero esta versión genera
   * DDL ejecutable, no solo comentarios.
   */
  private suggestIndexes(
    input: AiAnalysisInput,
    warnings: RuleWarning[],
  ): string[] {
    const tables = parseSchemaTables(input.schemaDdl);
    if (tables.size === 0) {
      // Sin schema parseable, caemos al comentario genérico legacy.
      return this.legacyIndexHints(warnings);
    }

    const candidates = extractIndexCandidates(input.query, tables);
    const suggestions: string[] = candidates.map(
      ({ table, column }) =>
        `CREATE INDEX IF NOT EXISTS idx_${table}_${column} ON ${table}(${column});`,
    );

    // Si hay función en WHERE, sumar un índice funcional sobre la primera
    // columna candidata que aparezca dentro de la función.
    if (warnings.some((w) => w.ruleId === 'FUNCTION_IN_WHERE')) {
      const fn = detectFunctionalIndex(input.query, tables);
      if (fn) {
        suggestions.push(
          `CREATE INDEX IF NOT EXISTS idx_${fn.table}_${fn.column}_${fn.fn.toLowerCase()} ON ${fn.table}(${fn.fn}(${fn.column}));`,
        );
      }
    }

    return suggestions;
  }

  /** Compatibilidad: si el schema no se pudo parsear, emitir el viejo set de hints. */
  private legacyIndexHints(warnings: RuleWarning[]): string[] {
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

// ============================================================================
// Helpers de parseo de schema y query para sugerir índices DDL reales.
// Son heurísticas, no un parser completo. Lo suficiente para detectar los
// casos comunes en retos académicos (SELECT ... JOIN ... ON, WHERE, ORDER BY).
// ============================================================================

/** Cada CREATE TABLE detectado se reduce a { tabla: Set<columna> }. */
function parseSchemaTables(schemaDdl: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  if (!schemaDdl) return tables;

  // Captura todos los bloques `CREATE TABLE <nombre> (<body>);`
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]+?)\)\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(schemaDdl)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const cols = new Set<string>();

    // Split por coma a nivel raíz (no dentro de paréntesis de tipos como DECIMAL(10,2)).
    const parts = body
      .split(/,(?![^()]*\))/g)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

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
      if (colMatch) cols.add(colMatch[1]);
    }
    tables.set(tableName, cols);
  }
  return tables;
}

interface IndexCandidate {
  table: string;
  column: string;
}

/**
 * Extrae pares (tabla, columna) que aparecen en WHERE / JOIN ON / ORDER BY del
 * `query`. Resuelve la tabla mediante:
 *   - alias en FROM/JOIN (`FROM customers c` → c.* pertenece a customers)
 *   - referencia directa `<tabla>.<col>`
 *   - lookup en el schema cuando la columna se usa sin prefijo y solo existe
 *     en una tabla.
 */
function extractIndexCandidates(
  query: string,
  tables: Map<string, Set<string>>,
): IndexCandidate[] {
  const aliases = collectAliases(query, tables);
  const seen = new Set<string>(); // "table.column"
  const result: IndexCandidate[] = [];

  const pushCandidate = (rawTable: string | null, column: string) => {
    const table = resolveTable(rawTable, column, aliases, tables);
    if (!table) return;
    const key = `${table}.${column}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ table, column });
  };

  // JOIN ... ON tabla.col = otra.col
  const onRegex = /\bON\s+([^()]+?)(?=\b(?:WHERE|GROUP|ORDER|HAVING|JOIN|LIMIT|;|$))/gi;
  let onM: RegExpExecArray | null;
  while ((onM = onRegex.exec(query)) !== null) {
    forEachColumnRef(onM[1], pushCandidate);
  }

  // WHERE ... (corta en GROUP/ORDER/HAVING/LIMIT)
  const whereM = query.match(/\bWHERE\s+([\s\S]+?)(?:GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|;|$)/i);
  if (whereM) forEachColumnRef(whereM[1], pushCandidate);

  // ORDER BY ...
  const orderM = query.match(/\bORDER\s+BY\s+([\s\S]+?)(?:LIMIT|;|$)/i);
  if (orderM) forEachColumnRef(orderM[1], pushCandidate);

  return result;
}

/** alias → tabla. `FROM customers c JOIN orders o` produce {c: customers, o: orders}. */
function collectAliases(
  query: string,
  tables: Map<string, Set<string>>,
): Map<string, string> {
  const aliases = new Map<string, string>();
  const regex = /\b(?:FROM|JOIN)\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(query)) !== null) {
    const table = m[1];
    const alias = m[2];
    if (tables.has(table)) {
      aliases.set(table, table);
      if (alias && alias.toUpperCase() !== 'WHERE' && alias.toUpperCase() !== 'ON') {
        aliases.set(alias, table);
      }
    }
  }
  return aliases;
}

/** Itera referencias `col` o `alias.col` en un fragmento de SQL. */
function forEachColumnRef(
  fragment: string,
  cb: (rawTable: string | null, column: string) => void,
): void {
  // Eliminar literales string (de cualquier comilla) y números entre apóstrofos
  // para que el regex no capture su contenido como columnas.
  const sanitized = fragment
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

  const refRegex = /\b(\w+)\.(\w+)\b|\b([a-zA-Z_]\w*)\b/g;
  const sqlKeywords = new Set([
    'AND', 'OR', 'NOT', 'IS', 'NULL', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE',
    'TRUE', 'FALSE', 'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
    'WHERE', 'FROM', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'ON',
    'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'UNION', 'ALL',
    'SELECT', 'WITH',
  ]);
  let m: RegExpExecArray | null;
  while ((m = refRegex.exec(sanitized)) !== null) {
    if (m[1] && m[2]) {
      // alias.col: el primero puede ser keyword (raro) → omitir si lo es.
      if (sqlKeywords.has(m[1].toUpperCase())) continue;
      cb(m[1], m[2]);
    } else if (m[3]) {
      const ident = m[3];
      if (sqlKeywords.has(ident.toUpperCase())) continue;
      if (/^\d+$/.test(ident)) continue;
      cb(null, ident);
    }
  }
}

function resolveTable(
  rawTable: string | null,
  column: string,
  aliases: Map<string, string>,
  tables: Map<string, Set<string>>,
): string | null {
  if (rawTable) {
    return aliases.get(rawTable) ?? (tables.has(rawTable) ? rawTable : null);
  }
  // Sin prefijo: resolver solo si la columna existe en UNA sola tabla.
  let match: string | null = null;
  for (const [tName, cols] of tables) {
    if (cols.has(column)) {
      if (match) return null; // ambigua → no se resuelve
      match = tName;
    }
  }
  return match;
}

/** Detecta `FN(col)` dentro del WHERE y devuelve la info para un índice funcional. */
function detectFunctionalIndex(
  query: string,
  tables: Map<string, Set<string>>,
): { table: string; column: string; fn: string } | null {
  const whereM = query.match(/\bWHERE\s+([\s\S]+?)(?:GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|;|$)/i);
  if (!whereM) return null;
  const aliases = collectAliases(query, tables);
  const fnRegex = /\b(UPPER|LOWER|TRIM|DATE)\s*\(\s*(?:(\w+)\.)?(\w+)\s*\)/i;
  const fnM = whereM[1].match(fnRegex);
  if (!fnM) return null;
  const [, fn, rawTable, column] = fnM;
  const table = resolveTable(rawTable ?? null, column, aliases, tables);
  if (!table) return null;
  return { table, column, fn: fn.toUpperCase() };
}
