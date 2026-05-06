"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVALUATIONS_QUEUE = exports.SUBMISSIONS_QUEUE = void 0;
require("reflect-metadata");
const bullmq_1 = require("bullmq");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
};
exports.SUBMISSIONS_QUEUE = 'submissions';
exports.EVALUATIONS_QUEUE = 'evaluations';
new bullmq_1.Queue(exports.SUBMISSIONS_QUEUE, { connection });
new bullmq_1.Queue(exports.EVALUATIONS_QUEUE, { connection });
const worker = new bullmq_1.Worker(exports.SUBMISSIONS_QUEUE, async (job) => {
    const { submissionId } = job.data;
    console.log(`[worker] Recibido submission=${submissionId}`);
    await prisma.submission.update({
        where: { id: submissionId },
        data: { status: client_1.SubmissionStatus.RUNNING },
    });
    await new Promise((r) => setTimeout(r, 500));
    const result = await prisma.submission.update({
        where: { id: submissionId },
        data: {
            status: client_1.SubmissionStatus.ACCEPTED,
            score: 100,
            executionTimeMs: 500,
        },
    });
    console.log(`[worker] Procesado submission=${submissionId} status=${result.status}`);
    return result;
}, { connection, concurrency: 2 });
worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} falló:`, err);
});
worker.on('ready', () => {
    console.log(`[worker] Listo. Escuchando cola "${exports.SUBMISSIONS_QUEUE}"`);
});
const shutdown = async () => {
    console.log('[worker] Cerrando...');
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
//# sourceMappingURL=main.js.map