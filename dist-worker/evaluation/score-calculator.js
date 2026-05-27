"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreCalculatorService = exports.ScoreCalculatorService = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ScoreCalculator');
const clamp = (v, min, max) => Math.max(min, Math.min(max, Math.round(v)));
class ScoreCalculatorService {
    calculateScore(context) {
        logger.info('Calculando score final...');
        const correctnessScore = this.calculateCorrectness(context.correctness);
        const timeScore = this.calculateTimeScore(context.executionTimeMs, context.timeLimit);
        const ai = context.aiQualityScore ?? {};
        const practicesScore = ai.goodPractices != null
            ? clamp(ai.goodPractices, 0, 10)
            : this.calculateSqlPractices(context.studentQuery);
        const clarityScore = clamp(ai.clarity ?? 0, 0, 5);
        const improvementScore = clamp(ai.improvement ?? 0, 0, 10);
        const finalScore = correctnessScore + timeScore + practicesScore + clarityScore + improvementScore;
        const breakdown = {
            correctness: correctnessScore,
            executionTime: timeScore,
            sqlPractices: practicesScore,
            clarity: clarityScore,
            improvement: improvementScore,
            final: Math.min(100, finalScore),
        };
        logger.info(`Score breakdown: correctness=${correctnessScore}, time=${timeScore}, practices=${practicesScore}, clarity=${clarityScore}, improvement=${improvementScore} => TOTAL=${breakdown.final}`);
        return breakdown;
    }
    calculateCorrectness(comparisonResult) {
        switch (comparisonResult.matchType) {
            case 'exact':
                logger.debug('✅ Resultado exacto (60 pts)');
                return 60;
            case 'partial':
                const partialScore = Math.round((comparisonResult.confidence / 100) * 60);
                logger.debug(`⚠️  Resultado parcial (${partialScore} pts, confianza ${comparisonResult.confidence}%)`);
                return partialScore;
            case 'wrong':
            default:
                logger.debug('❌ Resultado incorrecto (0 pts)');
                return 0;
        }
    }
    calculateTimeScore(executionTimeMs, timeLimitMs) {
        const percentOfLimit = executionTimeMs / timeLimitMs;
        let score;
        if (percentOfLimit <= 0.5) {
            score = 15;
            logger.debug(`⚡ Muy rápido (${executionTimeMs}ms, 15 pts)`);
        }
        else if (percentOfLimit <= 1.0) {
            score = 10;
            logger.debug(`✓ Rápido (${executionTimeMs}ms, 10 pts)`);
        }
        else if (percentOfLimit <= 1.5) {
            score = 5;
            logger.debug(`~ Lento (${executionTimeMs}ms, 5 pts)`);
        }
        else {
            score = 0;
            logger.warn(`🐢 Muy lento (${executionTimeMs}ms, 0 pts)`);
        }
        return score;
    }
    calculateSqlPractices(query) {
        let score = 0;
        const upperQuery = query.toUpperCase().trim();
        logger.debug('Analizando buenas prácticas SQL...');
        if (!upperQuery.includes('SELECT *')) {
            score += 2;
            logger.debug('  ✓ No usa SELECT * (2 pts)');
        }
        if (upperQuery.includes('WHERE')) {
            score += 2;
            logger.debug('  ✓ Usa WHERE clause (2 pts)');
        }
        const lines = query.split('\n');
        const hasGoodFormatting = lines.length > 1 ||
            query.includes('  ') ||
            query.split('\t').length > 1;
        if (hasGoodFormatting) {
            score += 2;
            logger.debug('  ✓ Buen formatting (2 pts)');
        }
        if (!upperQuery.includes('UNION')) {
            score += 1;
            logger.debug('  ✓ No usa UNION innecesario (1 pt)');
        }
        if (upperQuery.includes('SELECT') && upperQuery.includes('FROM')) {
            score += 1;
            logger.debug('  ✓ Estructura básica correcta (1 pt)');
        }
        if (upperQuery.includes('GROUP BY')) {
            score += 2;
            logger.debug('  ✓ Usa GROUP BY (2 pts)');
        }
        const finalPracticesScore = Math.min(10, score);
        logger.debug(`Puntuación de prácticas: ${finalPracticesScore}/10`);
        return finalPracticesScore;
    }
    generateFeedback(breakdown, query) {
        let feedback = '';
        if (breakdown.correctness === 60) {
            feedback += '✅ Resultado correcto! ';
        }
        else if (breakdown.correctness > 30) {
            feedback += '⚠️ Resultado parcialmente correcto. ';
        }
        else {
            feedback += '❌ Resultado incorrecto. Revisa tu lógica. ';
        }
        if (breakdown.executionTime >= 10) {
            feedback += 'Excelente tiempo de ejecución. ';
        }
        else if (breakdown.executionTime >= 5) {
            feedback += 'El tiempo de ejecución es aceptable. ';
        }
        else if (breakdown.executionTime > 0) {
            feedback += 'Considera optimizar tu query. ';
        }
        if (breakdown.sqlPractices >= 8) {
            feedback += '✓ Código limpio y bien estructurado.';
        }
        else if (breakdown.sqlPractices >= 5) {
            feedback += 'Podrías mejorar el formateo y estructura.';
        }
        else {
            feedback += 'Revisa buenas prácticas de SQL.';
        }
        return feedback;
    }
}
exports.ScoreCalculatorService = ScoreCalculatorService;
exports.scoreCalculatorService = new ScoreCalculatorService();
//# sourceMappingURL=score-calculator.js.map