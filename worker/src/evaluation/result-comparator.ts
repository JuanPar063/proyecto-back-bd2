/**
 * ============================================================
 * result-comparator.ts — Comparador de resultados SQL
 * ============================================================
 * Responsable de:
 * - Comparar resultado del estudiante vs expectedResult
 * - Verificar: columnas, orden, cantidad filas, valores
 * - Retornar: match exacto, partial match, o wrong
 * ============================================================
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('ResultComparator');

export interface ComparisonResult {
  isCorrect: boolean;
  matchType: 'exact' | 'partial' | 'wrong';
  rowsMatch: boolean;
  columnsMatch: boolean;
  valuesMatch: boolean;
  mismatchDetails?: string[];
  confidence: number; // 0-100%
}

export class ResultComparatorService {
  /**
   * Compara resultados con normalización
   *
   * Estrategia:
   * 1. Verifica cantidad de filas
   * 2. Verifica columnas (nombre, tipo)
   * 3. Compara valores (con normalización de tipos)
   * 4. Permite pequeñas diferencias de orden (si expectedResult especifica ORDER BY)
   *
   * @param actual - Resultado ejecutado (rows + columns)
   * @param expected - Resultado esperado (JSON array)
   * @returns Resultado de comparación
   */
  compare(
    actual: { rows: any[]; columns: string[] },
    expected: any[],
  ): ComparisonResult {
    logger.info(`Comparando resultados: ${actual.rows.length} actual vs ${expected.length} esperadas`);

    const mismatches: string[] = [];

    // 1. Cantidad de filas
    const rowsMatch = actual.rows.length === expected.length;
    if (!rowsMatch) {
      mismatches.push(
        `Cantidad de filas: esperadas ${expected.length}, obtuvo ${actual.rows.length}`,
      );
    }

    // 2. Columnas
    const columnsMatch = this.compareColumns(actual.columns, expected);
    if (!columnsMatch) {
      mismatches.push(`Columnas no coinciden. Esperadas: ${this.getExpectedColumns(expected)}`);
    }

    // 3. Valores
    let valuesMatch = true;
    if (rowsMatch && columnsMatch) {
      // Solo compara valores si filas y columnas coinciden
      for (let i = 0; i < actual.rows.length; i++) {
        if (!this.rowsEqual(actual.rows[i], expected[i])) {
          valuesMatch = false;
          mismatches.push(`Fila ${i}: valores no coinciden`);
          if (mismatches.length >= 3) break; // Limita detalles de errores
        }
      }
    }

    const isCorrect = rowsMatch && columnsMatch && valuesMatch;
    const matchType: 'exact' | 'partial' | 'wrong' = isCorrect
      ? 'exact'
      : rowsMatch && columnsMatch
        ? 'partial'
        : 'wrong';

    const confidence = isCorrect
      ? 100
      : rowsMatch && columnsMatch
        ? 60
        : rowsMatch || columnsMatch
          ? 30
          : 0;

    const result: ComparisonResult = {
      isCorrect,
      matchType,
      rowsMatch,
      columnsMatch,
      valuesMatch,
      mismatchDetails: mismatches,
      confidence,
    };

    if (isCorrect) {
      logger.success('✅ Resultado EXACTO');
    } else {
      logger.warn(`❌ Resultado incorrecto (${matchType}): ${mismatches.join('; ')}`);
    }

    return result;
  }

  /**
   * Compara estructuras de columnas
   * Verifica que existan las mismas columnas en el mismo orden
   */
  private compareColumns(actualColumns: string[], expectedRows: any[]): boolean {
    if (expectedRows.length === 0) {
      // Si expected es vacío, cualquier estructura es válida
      return true;
    }

    const expectedColumns = Object.keys(expectedRows[0]).sort();
    const actualColumnsSorted = actualColumns.sort();

    return JSON.stringify(expectedColumns) === JSON.stringify(actualColumnsSorted);
  }

  /**
   * Extrae nombres de columnas del expected result
   */
  private getExpectedColumns(expectedRows: any[]): string {
    if (expectedRows.length === 0) {
      return '(vacío)';
    }
    return Object.keys(expectedRows[0]).join(', ');
  }

  /**
   * Compara dos filas con normalización de tipos
   *
   * Casos especiales:
   * - null === null
   * - "123" == 123 (if types differ)
   * - "2024-01-01" == DATE("2024-01-01")
   */
  private rowsEqual(actual: any, expected: any): boolean {
    // Verifica claves
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();

    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      return false;
    }

    // Compara valores con normalización
    for (const key of actualKeys) {
      if (!this.valuesEqual(actual[key], expected[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Compara dos valores con normalización de tipos
   * Permite conversión flexible de tipos (string -> number, etc)
   */
  private valuesEqual(actual: any, expected: any): boolean {
    // null handling
    if (actual === null && expected === null) {
      return true;
    }
    if (actual === null || expected === null) {
      return false;
    }

    // Mismos valores exactamente
    if (actual === expected) {
      return true;
    }

    // Conversión de tipos numéricos
    if (!isNaN(actual) && !isNaN(expected)) {
      return Number(actual) === Number(expected);
    }

    // Conversión de strings
    if (typeof actual === 'string' && typeof expected === 'string') {
      // Comparación case-insensitive para booleans
      if (actual.toLowerCase() === 'true' && expected.toLowerCase() === 'true') {
        return true;
      }
      if (actual.toLowerCase() === 'false' && expected.toLowerCase() === 'false') {
        return true;
      }
      // Comparación case-insensitive para NULL
      if (actual.toLowerCase() === 'null' && expected.toLowerCase() === 'null') {
        return true;
      }
    }

    // Fecha: normaliza formato ISO
    if (this.isDate(actual) && this.isDate(expected)) {
      return new Date(actual).toISOString() === new Date(expected).toISOString();
    }

    return false;
  }

  private isDate(value: any): boolean {
    return !isNaN(Date.parse(value));
  }

  /**
   * Normaliza el resultado para almacenamiento
   * Convierte a JSON de forma consistente
   */
  normalizeResult(rows: any[]): any[] {
    return rows.map((row) => {
      const normalized: any = {};
      for (const [key, value] of Object.entries(row)) {
        // Convierte values a formato estándar
        normalized[key] =
          value === null
            ? null
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);
      }
      return normalized;
    });
  }
}

// Singleton
export const resultComparatorService = new ResultComparatorService();
