/**
 * ============================================================
 * score-calculator.ts — Calculador de puntuación
 * ============================================================
 * Fórmula de scoring:
 * - 60% Correctness (¿la query es correcta?)
 * - 15% Execution Time (¿qué tan rápida es?)
 * - 10% SQL Practices (análisis básico de buenas prácticas)
 * - 15% Reserved para futuro (analytics, etc)
 * = 100% Total
 *
 * NOTA: Es extensible. Pueden agregarse más criterios fácilmente.
 * ============================================================
 */

import { ScoreBreakdown } from '../docker/types';
import { ComparisonResult } from './result-comparator';
import { createLogger } from '../utils/logger';

const logger = createLogger('ScoreCalculator');

interface ScoringContext {
  correctness: ComparisonResult;
  executionTimeMs: number;
  timeLimit: number; // ms
  studentQuery: string;
  expectedRowCount: number;
  aiQualityScore?: {      // Reservado para asistente IA de Pardo
    goodPractices?: number; // 0-10
    clarity?: number;       // 0-5
    improvement?: number;   // 0-10
  } | null;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(v)));

export class ScoreCalculatorService {
  /**
   * Calcula el score final basado en múltiples criterios
   *
   * @param context - Contexto de evaluación
   * @returns Score breakdown (60-15-10 sistema)
   */
  calculateScore(context: ScoringContext): ScoreBreakdown {
    logger.info('Calculando score final...');

    // 1. Correctness: 0-60 pts
    const correctnessScore = this.calculateCorrectness(context.correctness);

    // 2. Execution Time: 0-15 pts
    const timeScore = this.calculateTimeScore(context.executionTimeMs, context.timeLimit);

    // 3. SQL Practices: 0-10 pts
    // Si el IA de Pardo respondió, usa sus scores. Si no, heurística propia.
    const ai = context.aiQualityScore ?? {};
    const practicesScore = (ai.goodPractices != null)
      ? clamp(ai.goodPractices, 0, 10)
      : this.calculateSqlPractices(context.studentQuery);

    // 4. Clarity: 0-5 pts (solo cuando Pardo entregue — por ahora 0)
    const clarityScore = clamp(ai.clarity ?? 0, 0, 5);

    // 5. Improvement: 0-10 pts (solo cuando Pardo entregue — por ahora 0)
    const improvementScore = clamp(ai.improvement ?? 0, 0, 10);

    const finalScore = correctnessScore + timeScore + practicesScore + clarityScore + improvementScore;

    const breakdown: ScoreBreakdown = {
      correctness: correctnessScore,
      executionTime: timeScore,
      sqlPractices: practicesScore,
      clarity: clarityScore,
      improvement: improvementScore,
      final: Math.min(100, finalScore),
    };

    logger.info(
      `Score breakdown: correctness=${correctnessScore}, time=${timeScore}, practices=${practicesScore}, clarity=${clarityScore}, improvement=${improvementScore} => TOTAL=${breakdown.final}`,
    );

    return breakdown;
  }

  /**
   * Calcula puntuación de correctness (0-60)
   *
   * Criterios:
   * - Exact match: 60 pts
   * - Partial match (filas OK, valores partial): 30 pts
   * - Wrong answer: 0 pts
   */
  private calculateCorrectness(comparisonResult: ComparisonResult): number {
    switch (comparisonResult.matchType) {
      case 'exact':
        logger.debug('✅ Resultado exacto (60 pts)');
        return 60;

      case 'partial':
        // Partial: algunas cosas correctas
        // Puntaje proporcional a confianza
        const partialScore = Math.round((comparisonResult.confidence / 100) * 60);
        logger.debug(`⚠️  Resultado parcial (${partialScore} pts, confianza ${comparisonResult.confidence}%)`);
        return partialScore;

      case 'wrong':
      default:
        logger.debug('❌ Resultado incorrecto (0 pts)');
        return 0;
    }
  }

  /**
   * Calcula puntuación de tiempo (0-15)
   *
   * Criterios:
   * - 0-50% del time limit: 15 pts (excelente)
   * - 50-100% del time limit: 10 pts (bueno)
   * - 100-150% del time limit: 5 pts (aceptable)
   * - >150% del time limit: 0 pts (demasiado lento)
   */
  private calculateTimeScore(executionTimeMs: number, timeLimitMs: number): number {
    const percentOfLimit = executionTimeMs / timeLimitMs;

    let score: number;
    if (percentOfLimit <= 0.5) {
      score = 15; // Excelente
      logger.debug(`⚡ Muy rápido (${executionTimeMs}ms, 15 pts)`);
    } else if (percentOfLimit <= 1.0) {
      score = 10; // Bueno
      logger.debug(`✓ Rápido (${executionTimeMs}ms, 10 pts)`);
    } else if (percentOfLimit <= 1.5) {
      score = 5; // Aceptable
      logger.debug(`~ Lento (${executionTimeMs}ms, 5 pts)`);
    } else {
      score = 0; // Demasiado lento
      logger.warn(`🐢 Muy lento (${executionTimeMs}ms, 0 pts)`);
    }

    return score;
  }

  /**
   * Calcula puntuación de buenas prácticas SQL (0-10)
   *
   * Análisis básico de la query:
   * - ✓ Usa SELECT específico (no SELECT *)
   * - ✓ Usa WHERE apropiadamente
   * - ✓ Usa LIMIT si aplica
   * - ✓ Evita subconsultas ineficientes
   * - ✓ Buen formatting (spacing, indentation)
   *
   * NOTA: Esto es análisis estático. En producción, podrían usar
   * EXPLAIN PLAN o AST parsing para más precisión.
   */
  private calculateSqlPractices(query: string): number {
    let score = 0;
    const upperQuery = query.toUpperCase().trim();

    logger.debug('Analizando buenas prácticas SQL...');

    // 1. Evita SELECT * (2 pts)
    if (!upperQuery.includes('SELECT *')) {
      score += 2;
      logger.debug('  ✓ No usa SELECT * (2 pts)');
    }

    // 2. Usa WHERE si es apropiado (2 pts)
    // Heurística: si hay múltiples filas en resultado, probablemente debería usar WHERE
    // Para este scoring, es simple: solo si el query incluye WHERE
    if (upperQuery.includes('WHERE')) {
      score += 2;
      logger.debug('  ✓ Usa WHERE clause (2 pts)');
    }

    // 3. Buen formatting: espacios, indentation (2 pts)
    const lines = query.split('\n');
    const hasGoodFormatting =
      lines.length > 1 || // Multi-line es mejor
      query.includes('  ') || // Indentation
      query.split('\t').length > 1; // Tabs

    if (hasGoodFormatting) {
      score += 2;
      logger.debug('  ✓ Buen formatting (2 pts)');
    }

    // 4. Evita UNION si es posible (1 pt)
    if (!upperQuery.includes('UNION')) {
      score += 1;
      logger.debug('  ✓ No usa UNION innecesario (1 pt)');
    }

    // 5. Sin errores obvios de lógica (1 pt)
    // Heurística: si tiene SELECT y FROM, probablemente está OK
    if (upperQuery.includes('SELECT') && upperQuery.includes('FROM')) {
      score += 1;
      logger.debug('  ✓ Estructura básica correcta (1 pt)');
    }

    // 6. Usa GROUP BY si es apropiado (2 pts) - heurística
    if (upperQuery.includes('GROUP BY')) {
      score += 2;
      logger.debug('  ✓ Usa GROUP BY (2 pts)');
    }

    // Total máximo: 12, capear a 10
    const finalPracticesScore = Math.min(10, score);
    logger.debug(`Puntuación de prácticas: ${finalPracticesScore}/10`);

    return finalPracticesScore;
  }

  /**
   * Genera un feedback textual basado en el score
   */
  generateFeedback(breakdown: ScoreBreakdown, query: string): string {
    let feedback = '';

    if (breakdown.correctness === 60) {
      feedback += '✅ Resultado correcto! ';
    } else if (breakdown.correctness > 30) {
      feedback += '⚠️ Resultado parcialmente correcto. ';
    } else {
      feedback += '❌ Resultado incorrecto. Revisa tu lógica. ';
    }

    if (breakdown.executionTime >= 10) {
      feedback += 'Excelente tiempo de ejecución. ';
    } else if (breakdown.executionTime >= 5) {
      feedback += 'El tiempo de ejecución es aceptable. ';
    } else if (breakdown.executionTime > 0) {
      feedback += 'Considera optimizar tu query. ';
    }

    if (breakdown.sqlPractices >= 8) {
      feedback += '✓ Código limpio y bien estructurado.';
    } else if (breakdown.sqlPractices >= 5) {
      feedback += 'Podrías mejorar el formateo y estructura.';
    } else {
      feedback += 'Revisa buenas prácticas de SQL.';
    }

    return feedback;
  }
}

// Singleton
export const scoreCalculatorService = new ScoreCalculatorService();
