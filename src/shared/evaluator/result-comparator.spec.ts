import {
  compareResults,
  describeVerdict,
  ComparisonExpected,
  ComparisonActual,
} from './result-comparator';

const exp = (
  columns: string[],
  rows: any[][],
  orderSensitive = false,
  floatTolerance = 0,
): ComparisonExpected => ({
  columns,
  rows: rows as any,
  orderSensitive,
  floatTolerance,
});

const act = (columns: string[], rows: any[][]): ComparisonActual => ({
  columns,
  rows: rows as any,
});

describe('compareResults', () => {
  describe('columnas', () => {
    it('falla si difieren la cantidad de columnas', () => {
      const r = compareResults(exp(['a', 'b'], []), act(['a'], []));
      expect(r).toMatchObject({ ok: false, reason: 'COLUMN_COUNT_MISMATCH' });
    });

    it('acepta nombres en distinto case por defecto', () => {
      const r = compareResults(
        exp(['Total', 'Name'], [[10, 'x']]),
        act(['total', 'name'], [[10, 'x']]),
      );
      expect(r.ok).toBe(true);
    });

    it('exige case exacto cuando se pide caseSensitiveColumns', () => {
      const r = compareResults(
        exp(['Total'], [[1]]),
        act(['total'], [[1]]),
        { caseSensitiveColumns: true },
      );
      expect(r).toMatchObject({ ok: false, reason: 'COLUMN_NAME_MISMATCH' });
    });

    it('falla si falta una columna', () => {
      const r = compareResults(exp(['a', 'b'], [[1, 2]]), act(['a', 'c'], [[1, 2]]));
      expect(r).toMatchObject({ ok: false, reason: 'COLUMN_NAME_MISMATCH' });
    });

    it('reordena columnas internamente cuando el set coincide pero el orden no', () => {
      const r = compareResults(
        exp(['a', 'b'], [[1, 'x']]),
        act(['b', 'a'], [['x', 1]]),
      );
      expect(r.ok).toBe(true);
    });
  });

  describe('filas (orderSensitive=false, multiset)', () => {
    it('acepta filas en distinto orden', () => {
      const r = compareResults(
        exp(['a'], [[1], [2], [3]]),
        act(['a'], [[3], [1], [2]]),
      );
      expect(r.ok).toBe(true);
    });

    it('rechaza si el conteo difiere aunque los valores estén', () => {
      const r = compareResults(
        exp(['a'], [[1], [1], [2]]),
        act(['a'], [[1], [2]]),
      );
      expect(r).toMatchObject({ ok: false, reason: 'ROW_COUNT_MISMATCH' });
    });

    it('exige misma multiplicidad para filas repetidas', () => {
      const r = compareResults(
        exp(['a'], [[1], [1], [2]]),
        act(['a'], [[1], [2], [2]]),
      );
      expect(r).toMatchObject({ ok: false, reason: 'ROW_CONTENT_MISMATCH' });
    });
  });

  describe('filas (orderSensitive=true)', () => {
    it('acepta solo si el orden es idéntico', () => {
      const r = compareResults(
        exp(['a'], [[1], [2], [3]], true),
        act(['a'], [[1], [2], [3]]),
      );
      expect(r.ok).toBe(true);
    });

    it('rechaza orden distinto incluso con mismos valores', () => {
      const r = compareResults(
        exp(['a'], [[1], [2], [3]], true),
        act(['a'], [[3], [2], [1]]),
      );
      expect(r).toMatchObject({
        ok: false,
        reason: 'ORDER_MISMATCH',
        firstDivergentRowIndex: 0,
      });
    });
  });

  describe('NULL handling', () => {
    it('considera NULL == NULL', () => {
      const r = compareResults(
        exp(['a', 'b'], [[1, null], [null, 'x']]),
        act(['a', 'b'], [[null, 'x'], [1, null]]),
      );
      expect(r.ok).toBe(true);
    });

    it('NULL ≠ 0', () => {
      const r = compareResults(
        exp(['a'], [[null]]),
        act(['a'], [[0]]),
      );
      expect(r.ok).toBe(false);
    });

    it('NULL ≠ string vacío', () => {
      const r = compareResults(
        exp(['a'], [[null]]),
        act(['a'], [['']]),
      );
      expect(r.ok).toBe(false);
    });
  });

  describe('tolerancia decimal', () => {
    it('matchea valores dentro de la tolerancia', () => {
      const r = compareResults(
        exp(['total'], [[1234.56]], false, 0.01),
        act(['total'], [[1234.563]]),
      );
      expect(r.ok).toBe(true);
    });

    it('rechaza valores fuera de la tolerancia', () => {
      const r = compareResults(
        exp(['total'], [[100.0]], false, 0.01),
        act(['total'], [[100.5]]),
      );
      expect(r.ok).toBe(false);
    });

    it('matchea 0 y -0 con cualquier tolerancia', () => {
      const r = compareResults(
        exp(['x'], [[0]], false, 0.01),
        act(['x'], [[-0]]),
      );
      expect(r.ok).toBe(true);
    });
  });

  describe('describeVerdict', () => {
    it('describe veredicto exitoso', () => {
      const v = compareResults(exp(['a'], [[1]]), act(['a'], [[1]]));
      expect(describeVerdict(v)).toMatch(/correcto.*1/i);
    });

    it('describe fallo con la razón', () => {
      const v = compareResults(exp(['a'], [[1]]), act(['a'], [[2]]));
      expect(describeVerdict(v)).toMatch(/ROW_CONTENT_MISMATCH/);
    });
  });
});
