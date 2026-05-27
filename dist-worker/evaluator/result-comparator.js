"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareResults = compareResults;
exports.describeVerdict = describeVerdict;
const normalizeColumn = (name, caseSensitive) => caseSensitive ? name : name.trim().toLowerCase();
function cellKey(value, tolerance) {
    if (value === null || value === undefined)
        return 'N';
    if (typeof value === 'boolean')
        return `B:${value ? 1 : 0}`;
    if (typeof value === 'number') {
        if (Number.isNaN(value))
            return 'X:NaN';
        if (!Number.isFinite(value))
            return value > 0 ? 'X:+Inf' : 'X:-Inf';
        if (tolerance > 0) {
            const k = Math.round(value / tolerance);
            return `D:${k === 0 ? 0 : k}`;
        }
        return `D:${value === 0 ? 0 : value}`;
    }
    return `S:${value}`;
}
const rowKey = (row, tolerance) => row.map((c) => cellKey(c, tolerance)).join('|');
function compareResults(expected, actual, options = {}) {
    const caseSensitive = options.caseSensitiveColumns === true;
    if (expected.columns.length !== actual.columns.length) {
        return {
            ok: false,
            reason: 'COLUMN_COUNT_MISMATCH',
            detail: `Se esperaban ${expected.columns.length} columna(s); el resultado trae ${actual.columns.length}.`,
        };
    }
    const expectedNames = expected.columns.map((c) => normalizeColumn(c, caseSensitive));
    const actualNames = actual.columns.map((c) => normalizeColumn(c, caseSensitive));
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
    const permutation = expectedNames.map((name) => actualNames.indexOf(name));
    const tolerance = Math.max(0, expected.floatTolerance ?? 0);
    if (expected.rows.length !== actual.rows.length) {
        return {
            ok: false,
            reason: 'ROW_COUNT_MISMATCH',
            detail: `Se esperaban ${expected.rows.length} fila(s); el resultado trae ${actual.rows.length}.`,
        };
    }
    if (expected.orderSensitive) {
        for (let i = 0; i < expected.rows.length; i++) {
            const expRow = expected.rows[i];
            const actRow = permutation.map((idx) => actual.rows[i][idx]);
            if (rowKey(expRow, tolerance) !== rowKey(actRow, tolerance)) {
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
    const expectedCounts = new Map();
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
        if (remaining === 1)
            expectedCounts.delete(k);
        else
            expectedCounts.set(k, remaining - 1);
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
function describeVerdict(verdict) {
    if (verdict.ok) {
        return `Resultado correcto: ${verdict.rowsCompared} fila(s) coinciden con el esperado.`;
    }
    return `${verdict.reason}: ${verdict.detail}`;
}
//# sourceMappingURL=result-comparator.js.map