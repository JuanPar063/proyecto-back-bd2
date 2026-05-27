"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultComparatorService = exports.ResultComparatorService = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ResultComparator');
class ResultComparatorService {
    compare(actual, expected) {
        logger.info(`Comparando resultados: ${actual.rows.length} actual vs ${expected.length} esperadas`);
        const mismatches = [];
        const rowsMatch = actual.rows.length === expected.length;
        if (!rowsMatch) {
            mismatches.push(`Cantidad de filas: esperadas ${expected.length}, obtuvo ${actual.rows.length}`);
        }
        const columnsMatch = this.compareColumns(actual.columns, expected);
        if (!columnsMatch) {
            mismatches.push(`Columnas no coinciden. Esperadas: ${this.getExpectedColumns(expected)}`);
        }
        let valuesMatch = true;
        if (rowsMatch && columnsMatch) {
            for (let i = 0; i < actual.rows.length; i++) {
                if (!this.rowsEqual(actual.rows[i], expected[i])) {
                    valuesMatch = false;
                    mismatches.push(`Fila ${i}: valores no coinciden`);
                    if (mismatches.length >= 3)
                        break;
                }
            }
        }
        const isCorrect = rowsMatch && columnsMatch && valuesMatch;
        const matchType = isCorrect
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
        const result = {
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
        }
        else {
            logger.warn(`❌ Resultado incorrecto (${matchType}): ${mismatches.join('; ')}`);
        }
        return result;
    }
    compareColumns(actualColumns, expectedRows) {
        if (expectedRows.length === 0) {
            return true;
        }
        const expectedColumns = Object.keys(expectedRows[0]).sort();
        const actualColumnsSorted = actualColumns.sort();
        return JSON.stringify(expectedColumns) === JSON.stringify(actualColumnsSorted);
    }
    getExpectedColumns(expectedRows) {
        if (expectedRows.length === 0) {
            return '(vacío)';
        }
        return Object.keys(expectedRows[0]).join(', ');
    }
    rowsEqual(actual, expected) {
        const actualKeys = Object.keys(actual).sort();
        const expectedKeys = Object.keys(expected).sort();
        if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
            return false;
        }
        for (const key of actualKeys) {
            if (!this.valuesEqual(actual[key], expected[key])) {
                return false;
            }
        }
        return true;
    }
    valuesEqual(actual, expected) {
        if (actual === null && expected === null) {
            return true;
        }
        if (actual === null || expected === null) {
            return false;
        }
        if (actual === expected) {
            return true;
        }
        if (!isNaN(actual) && !isNaN(expected)) {
            return Number(actual) === Number(expected);
        }
        if (typeof actual === 'string' && typeof expected === 'string') {
            if (actual.toLowerCase() === 'true' && expected.toLowerCase() === 'true') {
                return true;
            }
            if (actual.toLowerCase() === 'false' && expected.toLowerCase() === 'false') {
                return true;
            }
            if (actual.toLowerCase() === 'null' && expected.toLowerCase() === 'null') {
                return true;
            }
        }
        if (this.isDate(actual) && this.isDate(expected)) {
            return new Date(actual).toISOString() === new Date(expected).toISOString();
        }
        return false;
    }
    isDate(value) {
        return !isNaN(Date.parse(value));
    }
    normalizeResult(rows) {
        return rows.map((row) => {
            const normalized = {};
            for (const [key, value] of Object.entries(row)) {
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
exports.ResultComparatorService = ResultComparatorService;
exports.resultComparatorService = new ResultComparatorService();
//# sourceMappingURL=result-comparator.js.map