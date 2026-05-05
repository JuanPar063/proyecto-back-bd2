/**
 * ============================================================
 * Worker SQL — STUB (Entrega 1)
 * ============================================================
 * Consume mensajes de la cola "submissions" en Redis (BullMQ),
 * registra el estado en logs y simula el ciclo de vida:
 *
 *    QUEUED  ->  RUNNING  ->  ACCEPTED
 *
 * En la Entrega 2 se reemplaza la lógica de "process" para invocar
 * el Runner SQL real en Docker. Esta base está pensada para que
 * Jose pueda iterar directamente sobre ella.
 *
 * Ejecutar local:    npm run worker:dev
 * Ejecutar Docker:   docker compose up worker
 * ============================================================
 */
import 'reflect-metadata';
import { Worker, Queue, Job } from 'bullmq';
import { PrismaClient, SubmissionStatus } from '@prisma/client';

const prisma = new PrismaClient();

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

export const SUBMISSIONS_QUEUE = 'submissions';
export const EVALUATIONS_QUEUE = 'evaluations';

// Inicializa colas (mantiene declaración explícita)
new Queue(SUBMISSIONS_QUEUE, { connection });
new Queue(EVALUATIONS_QUEUE, { connection });

interface SubmissionJobData {
  submissionId: string;
}

const worker = new Worker<SubmissionJobData>(
  SUBMISSIONS_QUEUE,
  async (job: Job<SubmissionJobData>) => {
    const { submissionId } = job.data;
    console.log(`[worker] Recibido submission=${submissionId}`);

    // Marca RUNNING
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.RUNNING },
    });

    // Simulación de ejecución (Entrega 2 -> Runner SQL en Docker)
    await new Promise((r) => setTimeout(r, 500));

    // Marca ACCEPTED como stub
    const result = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.ACCEPTED,
        score: 100,
        executionTimeMs: 500,
      },
    });

    console.log(`[worker] Procesado submission=${submissionId} status=${result.status}`);
    return result;
  },
  { connection, concurrency: 2 },
);

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} falló:`, err);
});

worker.on('ready', () => {
  console.log(`[worker] Listo. Escuchando cola "${SUBMISSIONS_QUEUE}"`);
});

const shutdown = async () => {
  console.log('[worker] Cerrando...');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
