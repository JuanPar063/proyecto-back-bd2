"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVALUATIONS_QUEUE = exports.SUBMISSIONS_QUEUE = void 0;
require("reflect-metadata");
const bullmq_1 = require("bullmq");
const client_1 = require("@prisma/client");
const result_comparator_1 = require("./evaluator/result-comparator");
const score_calculator_1 = require("./evaluator/score-calculator");
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
async function runQueryStub(query, expected) {
    await new Promise((r) => setTimeout(r, 100));
    if (/expect:\s*TIMEOUT/i.test(query)) {
        return {
            status: 'TIMEOUT',
            executionTimeMs: 99999,
            rows: [],
            columns: [],
            errorMessage: '[stub] Forzado por marcador expect:TIMEOUT',
            explainPlan: null,
        };
    }
    if (/expect:\s*SYNTAX/i.test(query)) {
        return {
            status: 'SYNTAX_ERROR',
            executionTimeMs: 0,
            rows: [],
            columns: [],
            errorMessage: '[stub] Forzado por marcador expect:SYNTAX',
            explainPlan: null,
        };
    }
    if (/expect:\s*RUNTIME/i.test(query)) {
        return {
            status: 'RUNTIME_ERROR',
            executionTimeMs: 50,
            rows: [],
            columns: [],
            errorMessage: '[stub] Forzado por marcador expect:RUNTIME',
            explainPlan: null,
        };
    }
    if (/expect:\s*WRONG/i.test(query)) {
        return {
            status: 'OK',
            executionTimeMs: 120,
            rows: [],
            columns: expected.columns,
            errorMessage: null,
            explainPlan: null,
        };
    }
    return {
        status: 'OK',
        executionTimeMs: 120 + Math.floor(Math.random() * 200),
        rows: expected.rows,
        columns: expected.columns,
        errorMessage: null,
        explainPlan: null,
    };
}
function deriveStatus(runner, comparisonOk) {
    if (runner.status === 'TIMEOUT')
        return client_1.SubmissionStatus.TIME_LIMIT_EXCEEDED;
    if (runner.status === 'SYNTAX_ERROR')
        return client_1.SubmissionStatus.SYNTAX_ERROR;
    if (runner.status === 'RUNTIME_ERROR')
        return client_1.SubmissionStatus.RUNTIME_ERROR;
    if (comparisonOk === true)
        return client_1.SubmissionStatus.ACCEPTED;
    return client_1.SubmissionStatus.WRONG_ANSWER;
}
async function processSubmission(submissionId) {
    const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
            challenge: {
                select: {
                    id: true,
                    timeLimit: true,
                    databaseEngine: true,
                    expectedResult: true,
                },
            },
        },
    });
    if (!submission) {
        console.warn(`[worker] Submission ${submissionId} no existe; descartando`);
        return;
    }
    if (submission.status !== client_1.SubmissionStatus.QUEUED) {
        console.warn(`[worker] Submission ${submissionId} no está QUEUED (${submission.status}); descartando`);
        return;
    }
    await prisma.submission.update({
        where: { id: submissionId },
        data: { status: client_1.SubmissionStatus.RUNNING },
    });
    const expectedRow = submission.challenge.expectedResult;
    if (!expectedRow) {
        await prisma.submission.update({
            where: { id: submissionId },
            data: {
                status: client_1.SubmissionStatus.RUNTIME_ERROR,
                errorMessage: 'El reto no tiene ExpectedResult cargado; no se puede evaluar.',
            },
        });
        return;
    }
    const expected = {
        columns: expectedRow.columns,
        rows: expectedRow.rows,
        orderSensitive: expectedRow.orderSensitive,
        floatTolerance: expectedRow.floatTolerance,
    };
    const runner = await runQueryStub(submission.query, expected);
    let comparisonOk = null;
    let feedback = '';
    if (runner.status === 'OK') {
        const actual = {
            columns: runner.columns,
            rows: runner.rows,
        };
        const verdict = (0, result_comparator_1.compareResults)(expected, actual);
        comparisonOk = verdict.ok;
        feedback = (0, result_comparator_1.describeVerdict)(verdict);
    }
    else {
        feedback = runner.errorMessage ?? `Runner status: ${runner.status}`;
    }
    const finalStatus = deriveStatus(runner, comparisonOk);
    const breakdown = (0, score_calculator_1.calculateScore)({
        status: finalStatus,
        executionTimeMs: runner.executionTimeMs,
        timeLimitMs: submission.challenge.timeLimit,
        aiQualityScore: null,
    });
    await prisma.submission.update({
        where: { id: submissionId },
        data: {
            status: finalStatus,
            score: breakdown.total,
            executionTimeMs: runner.executionTimeMs,
            errorMessage: runner.errorMessage,
            feedback,
            runnerMetadata: {
                runnerStatus: runner.status,
                rowCount: runner.rows.length,
                columnCount: runner.columns.length,
                explainPlan: runner.explainPlan,
                breakdown,
            },
        },
    });
    console.log(`[worker] submission=${submissionId} status=${finalStatus} score=${breakdown.total} timeMs=${runner.executionTimeMs}`);
}
const worker = new bullmq_1.Worker(exports.SUBMISSIONS_QUEUE, async (job) => {
    const { submissionId } = job.data;
    console.log(`[worker] Procesando submission=${submissionId}`);
    try {
        await processSubmission(submissionId);
    }
    catch (err) {
        console.error(`[worker] Error en submission=${submissionId}:`, err);
        try {
            await prisma.submission.update({
                where: { id: submissionId },
                data: {
                    status: client_1.SubmissionStatus.RUNTIME_ERROR,
                    errorMessage: err.message ?? 'Error desconocido en el worker',
                },
            });
        }
        catch (e2) {
            console.error('[worker] No se pudo marcar RUNTIME_ERROR:', e2);
        }
        throw err;
    }
}, { connection, concurrency: 2 });
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