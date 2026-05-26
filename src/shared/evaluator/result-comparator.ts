/**
 * ============================================================
 * Comparador de resultados SQL — Entrega 2 (módulo Ruiz)
 * ============================================================
 *
 * Este archivo es la lógica canónica de comparación entre el
 * resultado devuelto por el Runner SQL (Jose) y el ExpectedResult
 * que carga el profesor con cada reto.
 *
 * Es código puro (sin dependencias de Nest / Prisma) para que
 * pueda ejecutarse igual en la API y en el Worker. El worker lo
 * re-exporta desde worker/src/evaluator/result-comparator.ts.
 *
 * Contrato compartido (Sección 5.2 del Plan_Entregable2):
 *   actual = { columns, rows }
 *   expected = { columns, rows, orderSensitive, floatTolerance }
 *
 * Decisiones:
 *   - Nombres de columna se comparan en minúsculas + trim (un
 *     estudiante puede usar `Total` mientras la solución oficial
 *     usa `total`; ambos son válidos).
 *   - Si el set de columnas coincide pero el orden difiere, las
 *     filas del estudiante se reordenan internamente antes de
 *     comparar. No es un error.
 *   - NULL es un valor por sí mismo (NULL == NULL).
 *   - Números se redondean al múltiplo de `floatTolerance` más
 *     cercano antes de generar la clave canónica del multiset.
 *     Si `floatTolerance = 0`, comparación exacta.
 *   - Cuando `orderSensitive = true` se exige mismo orden de filas.
 *     Cuando es `false`, se compara como multiset (admite
 *     repeticiones; ambas tablas deben tener idénticas frecuencias).
 * ============================================================
 */

export type CellValue = string | number | boolean | null;
export type Row = CellValue[];

export interface ComparisonExpected {
  columns: string[];
  rows: Row[];
  orderSensitive: boolean;
  /** Tolerancia ABSOLUTA para comparar números. 0 = comparación estricta. */
  floatTolerance: number;
}

export interface ComparisonActual {
  columns: string[];
  rows: Row[];
}

export type ComparisonReason =
  | 'COLUMN_COUNT_MISMATCH'
  | 'COLUMN_NAME_MISMATCH'
  | 'ROW_COUNT_MISMATCH'
  | 'ROW_CONTENT_MISMATCH'
  | 'ORDER_MISMATCH';

export type ComparisonVerdict =
  | { ok: true; rowsCompared: number }
  | {
      ok: false;
      reason: ComparisonReason;
      detail: string;
      /** Índice de la primera fila divergente (cuando aplica). */
      firstDivergentRowIndex?: number;
    };

export interface CompareOptions {
  /** Si true, los nombres de columnas se comparan con case y espacios. */
  caseSensitiveColumns?: boolean;
}

const normalizeColumn = (name: string, caseSensitive: boolean): string =>
  caseSensitive ? name : name.trim().toLowerCase();

/**
 * Genera la clave canónica de una celda. Dos celdas que deben
 * considerarse equivalentes producen exactamente la misma clave.
 */
function cellKey(value: CellValue, tolerance: number): string {
  if (value === null || value === undefined) return 'N';
  if (typeof value === 'boolean') return `B:${value ? 1 : 0}`;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'X:NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'X:+Inf' : 'X:-Inf';
    if (tolerance > 0) {
      // Redondeo al múltiplo de tolerance más cercano.
      const k = Math.round(value / tolerance);
      // Normaliza -0 a 0 para que tengan la misma clave.
      return `D:${k === 0 ? 0 : k}`;
    }
    // Sin tolerancia: usar representación exacta.
    return `D:${value === 0 ? 0 : value}`;
  }
  // string u otra cosa que ya venga serializada
  return `S:${value}`;
}

const rowKey = (row: Row, tolerance: number): string =>
  row.map((c) => cellKey(c, tolerance)).join('|');

/**
 * Compara el resultado del Runner contra el esperado del reto.
 *
 * Importante: esta función NO arroja excepciones — devuelve un
 * veredicto estructurado. El llamador (worker / submissions.service)
 * decide cómo traducirlo a SubmissionStatus.
 */
export function compareResults(
  expected: ComparisonExpected,
  actual: ComparisonActual,
  options: CompareOptions = {},
): ComparisonVerdict {
  const caseSensitive = options.caseSensitiveColumns === true;

  // 1) Mismo número de columnas
  if (expected.columns.length !== actual.columns.length) {
    return {
      ok: false,
      reason: 'COLUMN_COUNT_MISMATCH',
      detail: `Se esperaban ${expected.columns.length} columna(s); el resultado trae ${actual.columns.length}.`,
    };
  }

  const expectedNames = expected.columns.map((c) => normalizeColumn(c, caseSensitive));
  const actualNames = actual.columns.map((c) => normalizeColumn(c, caseSensitive));

  // 2) Mismo *conjunto* de columnas (independiente del orden)
  const expectedSet = new Set(expectedNames);
  const actualSet = new Set(actualNames);
  if (expectedSet.size !== expectedNames.length) {
    return {
      ok: false,
      reason: 'COLUMN_NAME_MISMATCH',
      detail: 'El resultado esperado tiene columnas duplicadas tras normalizar nombres.',
    };
  }
  if (actualSet.size !== actualNames.length) {
    return {
      ok: false,
      reason: 'COLUMN_NAME_MISMATCH',
      detail: 'El resultado del estudiante tiene columnas duplicadas.',
    };
  }
  for (const name of expectedSet) {
    if (!actualSet.has(name)) {
      return {
        ok: false,
        reason: 'COLUMN_NAME_MISMATCH',
        detail: `Falta la columna "${name}" en el resultado.`,
      };
    }
  }
  for (const name of actualSet) {
    if (!expectedSet.has(name)) {
      return {
        ok: false,
        reason: 'COLUMN_NAME_MISMATCH',
        detail: `El resultado incluye una columna no esperada: "${name}".`,
      };
    }
  }

  // 3) Reordenar las celdas del estudiante para alinearlas con el
  //    orden del esperado. permutation[i] = índice en actual.
  const permutation: number[] = expectedNames.map((name) => actualNames.indexOf(name));
  const tolerance = Math.max(0, expected.floatTolerance ?? 0);

  // 4) Mismo número de filas
  if (expected.rows.length !== actual.rows.length) {
    return {
      ok: false,
      reason: 'ROW_COUNT_MISMATCH',
      detail: `Se esperaban ${expected.rows.length} fila(s); el resultado trae ${actual.rows.length}.`,
    };
  }

  // 5) Comparación según sensibilidad al orden
  if (expected.orderSensitive) {
    for (let i = 0; i < expected.rows.length; i++) {
      const expRow = expected.rows[i];
      const actRow = permutation.map((idx) => actual.rows[i][idx]);
      const expKey = rowKey(expRow, tolerance);
      const actKey = rowKey(actRow, tolerance);
      if (expKey !== actKey) {
        return {
          ok: false,
          reason: 'ORDER_MISMATCH',
          detail: `Fila ${i + 1}: el contenido no coincide con el orden esperado.`,
          firstDivergentRowIndex: i,
        };
      }
    }
    return { ok: true, rowsCompared: expected.rows.length };
  }

  // Multiset: contar ocurrencias y comparar
  const expectedCounts = new Map<string, number>();
  for (const r of expected.rows) {
    const k = rowKey(r, tolerance);
    expectedCounts.set(k, (expectedCounts.get(k) ?? 0) + 1);
  }
  for (let i = 0; i < actual.rows.length; i++) {
    const reordered = permutation.map((idx) => actual.rows[i][idx]);
    const k = rowKey(reordered, tolerance);
    const remaining = expectedCounts.get(k);
    if (!remaining) {
      return {
        ok: false,
        reason: 'ROW_CONTENT_MISMATCH',
        detail: `Fila ${i + 1} no aparece en el resultado esperado.`,
        firstDivergentRowIndex: i,
      };
    }
    if (remaining === 1) {
      expectedCounts.delete(k);
    } else {
      expectedCounts.set(k, remaining - 1);
    }
  }
  if (expectedCounts.size > 0) {
    return {
      ok: false,
      reason: 'ROW_CONTENT_MISMATCH',
      detail: 'Hay filas esperadas que no aparecen en el resultado del estudiante.',
    };
  }

  return { ok: true, rowsCompared: expected.rows.length };
}

/**
 * Texto humano para mostrar al estudiante en `submission.feedback`.
 * El asistente IA (Pardo) puede reemplazar / enriquecer este texto.
 */
export function describeVerdict(verdict: ComparisonVerdict): string {
  if (verdict.ok) {
    return `Resultado correcto: ${verdict.rowsCompared} fila(s) coinciden con el esperado.`;
  }
  return `${verdict.reason}: ${verdict.detail}`;
}
