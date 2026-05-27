"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVALUATIONS_QUEUE = exports.SUBMISSIONS_QUEUE = void 0;
require("reflect-metadata");
const bullmq_1 = require("bullmq");
const client_1 = require("@prisma/client");
const logger_1 = require("./utils/logger");
const docker_service_1 = require("./docker/docker.service");
const postgres_health_service_1 = require("./docker/postgres-health.service");
const sql_executor_service_1 = require("./docker/sql-executor.service");
const result_comparator_1 = require("./evaluation/result-comparator");
const score_calculator_1 = require("./evaluation/score-calculator");
const prisma = new client_1.PrismaClient();
const mainLogger = (0, logger_1.createLogger)('Worker');
const connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
};
exports.SUBMISSIONS_QUEUE = 'submissions';
exports.EVALUATIONS_QUEUE = 'evaluations';
const CONTAINER_CONFIG = {
    memory: 512 * 1024 * 1024,
    cpus: 0.5,
    timeout: 30000,
};
new bullmq_1.Queue(exports.SUBMISSIONS_QUEUE, { connection });
new bullmq_1.Queue(exports.EVALUATIONS_QUEUE, { connection });
const worker = new bullmq_1.Worker(exports.SUBMISSIONS_QUEUE, async (job) => {
    const { submissionId } = job.data;
    mainLogger.info(`\n${'='.repeat(60)}`);
    mainLogger.info(`Procesando submission: ${submissionId}`);
    mainLogger.info(`${'='.repeat(60)}`);
    let containerId = null;
    try {
        mainLogger.info('FASE 1: Obteniendo datos del submission...');
        const evaluationContext = await getEvaluationContext(submissionId);
        await prisma.submission.update({
            where: { id: submissionId },
            data: { status: client_1.SubmissionStatus.RUNNING },
        });
        mainLogger.info('FASE 2: Creando contenedor PostgreSQL...');
        containerId = await docker_service_1.dockerService.createPostgresContainer(submissionId, CONTAINER_CONFIG);
        mainLogger.info('FASE 3: Esperando a que PostgreSQL esté listo...');
        const containerIp = await docker_service_1.dockerService.getContainerIp(containerId);
        const isReady = await postgres_health_service_1.postgresHealthCheckService.waitForPostgresReady(containerIp, 5432, 30, 60000);
        if (!isReady) {
            throw new Error('PostgreSQL no estuvo listo en el tiempo establecido');
        }
        mainLogger.info('FASE 4: Conectando a PostgreSQL y ejecutando SQL...');
        await sql_executor_service_1.sqlExecutorService.connect(containerIp, 5432, 'eval_db', 'eval_user', 'eval_password', CONTAINER_CONFIG.timeout);
        const sqlResult = await sql_executor_service_1.sqlExecutorService.executeFullPipeline(evaluationContext.schemaSql, evaluationContext.seedSql, evaluationContext.studentQuery, evaluationContext.challengeTimeLimit);
        if (!sqlResult.success) {
            mainLogger.warn(`Error SQL: ${sqlResult.error}`);
            let status;
            if (sqlResult.error?.includes('TIME_LIMIT_EXCEEDED')) {
                status = client_1.SubmissionStatus.TIME_LIMIT_EXCEEDED;
            }
            else if (sqlResult.error?.includes('SYNTAX_ERROR')) {
                status = client_1.SubmissionStatus.SYNTAX_ERROR;
            }
            else {
                status = client_1.SubmissionStatus.RUNTIME_ERROR;
            }
            await prisma.submission.update({
                where: { id: submissionId },
                data: {
                    status,
                    errorMessage: sqlResult.error,
                    executionTimeMs: sqlResult.executionTimeMs,
                },
            });
            mainLogger.warn(`Submission finalizado con status: ${status}`);
            return;
        }
        mainLogger.info('FASE 6: Comparando resultados...');
        const comparisonResult = result_comparator_1.resultComparatorService.compare({
            rows: sqlResult.rows,
            columns: sqlResult.columns,
        }, evaluationContext.expectedResult ?? []);
        let aiQualityScore = null;
        try {
            const apiUrl = process.env.API_URL ?? 'http://api:3000/api';
            const resp = await fetch(`${apiUrl}/ai-assistant/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: evaluationContext.studentQuery,
                    schemaDdl: evaluationContext.schemaSql,
                    executionTimeMs: sqlResult.executionTimeMs,
                    explainPlan: sqlResult.explainPlan,
                    status: comparisonResult.isCorrect ? 'ACCEPTED' : 'WRONG_ANSWER',
                }),
            });
            if (resp.ok) {
                const ai = await resp.json();
                aiQualityScore = ai.qualityScore ?? null;
                mainLogger.info('Asistente IA respondió ✓');
            }
            else {
                mainLogger.warn(`Asistente IA respondió ${resp.status} — continuando sin IA`);
            }
        }
        catch (e) {
            mainLogger.warn(`Asistente IA no disponible: ${e.message} — continuando sin IA`);
        }
        mainLogger.info('FASE 7: Calculando puntuación...');
        const scoreBreakdown = score_calculator_1.scoreCalculatorService.calculateScore({
            correctness: comparisonResult,
            executionTimeMs: sqlResult.executionTimeMs,
            timeLimit: evaluationContext.challengeTimeLimit,
            studentQuery: evaluationContext.studentQuery,
            expectedRowCount: evaluationContext.expectedResult?.length ?? 0,
            aiQualityScore,
        });
        const feedback = score_calculator_1.scoreCalculatorService.generateFeedback(scoreBreakdown, evaluationContext.studentQuery);
        const finalStatus = comparisonResult.isCorrect
            ? client_1.SubmissionStatus.ACCEPTED
            : sqlResult.executionTimeMs > evaluationContext.challengeTimeLimit
                ? client_1.SubmissionStatus.TIME_LIMIT_EXCEEDED
                : client_1.SubmissionStatus.WRONG_ANSWER;
        mainLogger.info('FASE 9: Guardando resultados en DB...');
        const submission = await prisma.submission.update({
            where: { id: submissionId },
            data: {
                status: finalStatus,
                score: scoreBreakdown.final,
                scoreBreakdown: scoreBreakdown,
                resultData: sqlResult.rows,
                executionTimeMs: sqlResult.executionTimeMs,
                errorMessage: feedback,
            },
        });
        mainLogger.success(`✅ Submission completado: ${finalStatus} (Score: ${scoreBreakdown.final}/100)`);
        mainLogger.info(`Detalles: ${feedback}`);
        return submission;
    }
    catch (error) {
        mainLogger.error(`ERROR general: ${error.message}`);
        try {
            await prisma.submission.update({
                where: { id: submissionId },
                data: {
                    status: client_1.SubmissionStatus.RUNTIME_ERROR,
                    errorMessage: `Worker error: ${error.message}`,
                },
            });
        }
        catch (updateError) {
            mainLogger.error(`No se pudo actualizar submission: ${updateError}`);
        }
        throw error;
    }
    finally {
        if (containerId) {
            mainLogger.info('CLEANUP: Destruyendo contenedor...');
            try {
                await sql_executor_service_1.sqlExecutorService.disconnect();
                await docker_service_1.dockerService.destroyContainer(submissionId, true);
                mainLogger.success('Contenedor destruido ✓');
            }
            catch (cleanupError) {
                mainLogger.warn(`Error durante cleanup: ${cleanupError}`);
            }
        }
    }
}, {
    connection,
    concurrency: 2,
});
worker.on('failed', (job, err) => {
    mainLogger.error(`Job ${job?.id} falló: ${err?.message}`);
});
worker.on('ready', () => {
    mainLogger.success(`✅ Worker listo. Escuchando cola "${exports.SUBMISSIONS_QUEUE}"`);
});
worker.on('completed', (job) => {
    mainLogger.info(`Job ${job.id} completado`);
});
const shutdown = async () => {
    mainLogger.info('\n⏹️  Iniciando shutdown graceful...');
    try {
        await docker_service_1.dockerService.cleanupAllContainers();
        await worker.close();
        await prisma.$disconnect();
        mainLogger.success('✅ Shutdown completado');
        process.exit(0);
    }
    catch (error) {
        mainLogger.error(`Error durante shutdown: ${error}`);
        process.exit(1);
    }
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
async function getEvaluationContext(submissionId) {
    const submission = await prisma.submission.findUniqueOrThrow({
        where: { id: submissionId },
        include: {
            challenge: {
                include: {
                    schema: true,
                    testDatasets: {
                        orderBy: { createdAt: 'asc' },
                        take: 1,
                    },
                },
            },
            student: {
                select: { id: true },
            },
        },
    });
    if (!submission.challenge.schema) {
        throw new Error('Challenge no tiene schema definido');
    }
    const dataset = submission.challenge.testDatasets[0];
    if (!dataset || !dataset.sql) {
        throw new Error('Challenge no tiene TestDataset cargado; el runner no puede sembrar datos.');
    }
    mainLogger.info(`Submission ID: ${submissionId}`);
    mainLogger.info(`Challenge: ${submission.challenge.title}`);
    mainLogger.info(`Estudiante: ${submission.studentId}`);
    mainLogger.info(`Query: ${submission.query.substring(0, 100)}...`);
    return {
        submissionId,
        studentId: submission.studentId,
        challengeId: submission.challengeId,
        challengeTimeLimit: submission.challenge.timeLimit,
        schemaSql: submission.challenge.schema.ddl,
        seedSql: dataset.sql,
        studentQuery: submission.query,
        expectedResult: submission.challenge.expectedResult,
        databaseEngine: submission.challenge.databaseEngine,
    };
}
//# sourceMappingURL=main.js.map