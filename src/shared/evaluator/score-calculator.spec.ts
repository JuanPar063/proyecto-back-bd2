import { calculateScore } from './score-calculator';

describe('calculateScore', () => {
  it('da 0 si la submission no es ACCEPTED', () => {
    const r = calculateScore({
      status: 'WRONG_ANSWER',
      executionTimeMs: 100,
      timeLimitMs: 2000,
    });
    expect(r.total).toBe(0);
    expect(r.correctness).toBe(0);
    expect(r.performance).toBe(0);
  });

  it('máximo performance (15) si el tiempo está dentro de la zona verde (≤ 25% del límite)', () => {
    const r = calculateScore({
      status: 'ACCEPTED',
      executionTimeMs: 100, // 5% de 2000
      timeLimitMs: 2000,
    });
    expect(r.correctness).toBe(60);
    expect(r.performance).toBe(15);
    expect(r.total).toBe(75);
  });

  it('performance 0 si llega al timeLimit aunque sea ACCEPTED', () => {
    const r = calculateScore({
      status: 'ACCEPTED',
      executionTimeMs: 2000,
      timeLimitMs: 2000,
    });
    expect(r.correctness).toBe(60);
    expect(r.performance).toBe(0);
    expect(r.total).toBe(60);
  });

  it('performance intermedio decrece linealmente', () => {
    const r = calculateScore({
      status: 'ACCEPTED',
      executionTimeMs: 1500, // entre 500 (25%) y 2000
      timeLimitMs: 2000,
    });
    // ratio = (2000-1500)/(2000-500) = 500/1500 = 1/3 → ~5
    expect(r.performance).toBeGreaterThan(0);
    expect(r.performance).toBeLessThan(15);
  });

  it('suma las dimensiones IA cuando vienen', () => {
    const r = calculateScore({
      status: 'ACCEPTED',
      executionTimeMs: 100,
      timeLimitMs: 2000,
      aiQualityScore: { goodPractices: 9, clarity: 4, improvement: 8 },
    });
    expect(r.goodPractices).toBe(9);
    expect(r.clarity).toBe(4);
    expect(r.improvement).toBe(8);
    expect(r.total).toBe(60 + 15 + 9 + 4 + 8);
  });

  it('clampa los sub-scores IA al máximo permitido', () => {
    const r = calculateScore({
      status: 'ACCEPTED',
      executionTimeMs: 100,
      timeLimitMs: 2000,
      aiQualityScore: { goodPractices: 99, clarity: 99, improvement: 99 },
    });
    expect(r.goodPractices).toBe(10);
    expect(r.clarity).toBe(5);
    expect(r.improvement).toBe(10);
    expect(r.total).toBe(100);
  });

  it('trata IA ausente como 0 (escenario actual: Pardo aún no entrega)', () => {
    const r = calculateScore({
      status: 'ACCEPTED',
      executionTimeMs: 100,
      timeLimitMs: 2000,
    });
    expect(r.goodPractices).toBe(0);
    expect(r.clarity).toBe(0);
    expect(r.improvement).toBe(0);
  });
});
