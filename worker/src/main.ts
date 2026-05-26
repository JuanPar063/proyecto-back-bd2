/**
 * ============================================================
 * Worker SQL — Entrega 2 (stub-evaluator, pre-runner)
 * ============================================================
 *
 * Consume de la cola "submissions" en Redis. Mantiene la
 * estructura del Entregable 1 (BullMQ + Prisma) pero ya invoca
 * el comparador y el scoring real implementados por Ruiz, para
 * que el resto del equipo pueda probar el flujo end-to-end antes
 * de que Jose conecte el Runner SQL en Docker.
 *
 * Lo que ESTE archivo deja para Jose:
 *   1) Reemplazar `runQueryStub` por `DockerRunnerService.run(...)`
 *      con el contrato compartido `RunnerResult` (sección 5.2 del
 *      Plan_Entregable2): { status, executionTimeMs, rows, columns,
 *      errorMessage, explainPlan }.
 *   2) Manejar SYNTAX_ERROR / RUNTIME_ERROR / TIME_LIMIT_EXCEEDED
 *      según lo que devuelva el runner.
 *
 * Lo que ESTE archivo deja para Pardo:
 *   - El paso "ai recommendation" está marcado con TODO. Cuando
 *     el módulo ai-assistant esté listo, llamarlo aquí entre la
 *     comparación y el cálculo de score.
 *
 * Ejecutar local:    npm run worker:dev
 * Ejecutar Docker:   docker compose up worker
 * ============================================================
 */
import 'reflect-metadata';
import { Worker, Queue, Job } from 'bullmq';
import { PrismaClient, SubmissionStatus } from '@prisma/client';
import {
  ComparisonExpected,
  ComparisonActual,
  compareResults,
  describeVerdict,
  Row,
} from './evaluator/result-comparator';
import { calculateScore } from './evaluator/score-calculator';

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

/**
 * Contrato del resultado del Runner (Sección 5.2 del Plan).
 * Jose entrega este shape desde el DockerRunnerService real.
 */
interface RunnerResult {
  status: 'OK' | 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | 'TIMEOUT';
  executionTimeMs: number;
  rows: Row[];
  columns: string[];
  errorMessage: string | null;
  explainPlan: string | null;
}

/**
 * Stub temporal del Runner. Devuelve exactamente el ExpectedResult
 * para que el comparador siempre dé ACCEPTED — útil para validar el
 * flujo end-to-end del Entregable 2 antes del runner real.
 *
 * Convenciones que el stub soporta para forzar otros estados
 * (útiles para grabar la demo / probar transiciones):
 *   - Si la query contiene "/* expect:WRONG *\/"   -> devuelve filas vacías
 *   - Si la query contiene "/* expect:TIMEOUT *\/" -> retorna TIMEOUT
 *   - Si la query contiene "/* expect:SYNTAX *\/"  -> retorna SYNTAX_ERROR
 *   - Si la query contiene "/* expect:RUNTIME *\/" -> retorna RUNTIME_ERROR
 */
async function runQueryStub(
  query: string,
  expected: ComparisonExpected,
): Promise<RunnerResult> {
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

  // Camino feliz: devolver exactamente lo esperado.
  return {
    status: 'OK',
    executionTimeMs: 120 + Math.floor(Math.random() * 200),
    rows: expected.rows,
    columns: expected.columns,
    errorMessage: null,
    explainPlan: null,
  };
}

/** Traduce el RunnerResult + verdicto del comparador a SubmissionStatus. */
function deriveStatus(
  runner: RunnerResult,
  comparisonOk: boolean | null,
): SubmissionStatus {
  if (runner.status === 'TIMEOUT') return SubmissionStatus.TIME_LIMIT_EXCEEDED;
  if (runner.status === 'SYNTAX_ERROR') return SubmissionStatus.SYNTAX_ERROR;
  if (runner.status === 'RUNTIME_ERROR') return SubmissionStatus.RUNTIME_ERROR;
  // Runner OK: depende de la comparación
  if (comparisonOk === true) return SubmissionStatus.ACCEPTED;
  return SubmissionStatus.WRONG_ANSWER;
}

async function processSubmission(submissionId: string) {
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
  if (submission.status !== SubmissionStatus.QUEUED) {
    console.warn(
      `[worker] Submission ${submissionId} no está QUEUED (${submission.status}); descartando`,
    );
    return;
  }

  // 1) QUEUED -> RUNNING
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.RUNNING },
  });

  // 2) Validación: hay ExpectedResult cargado?
  const expectedRow = submission.challenge.expectedResult;
  if (!expectedRow) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.RUNTIME_ERROR,
        errorMessage:
          'El reto no tiene ExpectedResult cargado; no se puede evaluar.',
      },
    });
    return;
  }
  const expected: ComparisonExpected = {
    columns: expectedRow.columns,
    rows: expectedRow.rows as unknown as Row[],
    orderSensitive: expectedRow.orderSensitive,
    floatTolerance: expectedRow.floatTolerance,
  };

  // 3) Ejecutar la query (stub — Jose reemplaza por DockerRunnerService)
  const runner = await runQueryStub(submission.query, expected);

  // 4) Comparar (solo si runner devolvió OK)
  let comparisonOk: boolean | null = null;
  let feedback = '';
  if (runner.status === 'OK') {
    const actual: ComparisonActual = {
      columns: runner.columns,
      rows: runner.rows,
    };
    const verdict = compareResults(expected, actual);
    comparisonOk = verdict.ok;
    feedback = describeVerdict(verdict);
  } else {
    feedback = runner.errorMessage ?? `Runner status: ${runner.status}`;
  }

  // 5) Derivar SubmissionStatus final y validar transición
  const finalStatus = deriveStatus(runner, comparisonOk);
  // (assertValidTransition no se importa aquí para no acoplar el worker al
  // src/ de la API; sin embargo el dominio garantiza que RUNNING -> X siempre
  // es válido para X en TERMINAL_STATUSES.)

  // 6) Calcular score (sin IA por ahora — Pardo lo enchufa después)
  const breakdown = calculateScore({
    status: finalStatus,
    executionTimeMs: runner.executionTimeMs,
    timeLimitMs: submission.challenge.timeLimit,
    aiQualityScore: null, // TODO Pardo: completar con goodPractices / clarity / improvement
  });

  // 7) Persistir resultado final
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
      } as any,
    },
  });

  console.log(
    `[worker] submission=${submissionId} status=${finalStatus} score=${breakdown.total} timeMs=${runner.executionTimeMs}`,
  );
}

const worker = new Worker<SubmissionJobData>(
  SUBMISSIONS_QUEUE,
  async (job: Job<SubmissionJobData>) => {
    const { submissionId } = job.data;
    console.log(`[worker] Procesando submission=${submissionId}`);
    try {
      await processSubmission(submissionId);
    } catch (err) {
      console.error(`[worker] Error en submission=${submissionId}:`, err);
      // Si no se persistió nada, marcamos como RUNTIME_ERROR para que el
      // estudiante no se quede colgado en RUNNING.
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: SubmissionStatus.RUNTIME_ERROR,
            errorMessage: (err as Error).message ?? 'Error desconocido en el worker',
          },
        });
      } catch (e2) {
        console.error('[worker] No se pudo marcar RUNTIME_ERROR:', e2);
      }
      throw err;
    }
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
