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
import { createLogger } from './utils/logger';
import { dockerService } from './docker/docker.service';
import { postgresHealthCheckService } from './docker/postgres-health.service';
import { sqlExecutorService } from './docker/sql-executor.service';
import { resultComparatorService } from './evaluation/result-comparator';
import { scoreCalculatorService } from './evaluation/score-calculator';
import { EvaluationContext } from './docker/types';

const prisma = new PrismaClient();
const mainLogger = createLogger('Worker');

// ============================================================
// CONFIGURACIÓN
// ============================================================

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

export const SUBMISSIONS_QUEUE = 'submissions';
export const EVALUATIONS_QUEUE = 'evaluations';

// Límites de recursos para contenedores temporales
const CONTAINER_CONFIG = {
  memory: 512 * 1024 * 1024, // 512 MB
  cpus: 0.5,
  timeout: 30000, // 30 segundos query timeout
};

// Inicializa colas
new Queue(SUBMISSIONS_QUEUE, { connection });
new Queue(EVALUATIONS_QUEUE, { connection });

// ============================================================
// TIPOS
// ============================================================

interface SubmissionJobData {
  submissionId: string;
}

// ============================================================
// WORKER PRINCIPAL
// ============================================================

const worker = new Worker<SubmissionJobData>(
  SUBMISSIONS_QUEUE,
  async (job: Job<SubmissionJobData>) => {
    const { submissionId } = job.data;
    mainLogger.info(`\n${'='.repeat(60)}`);
    mainLogger.info(`Procesando submission: ${submissionId}`);
    mainLogger.info(`${'='.repeat(60)}`);

    let containerId: string | null = null;

    try {
      // FASE 1: Obtener datos
      mainLogger.info('FASE 1: Obteniendo datos del submission...');
      const evaluationContext = await getEvaluationContext(submissionId);

      // Marca RUNNING
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.RUNNING },
      });

      // FASE 2: Crear contenedor Docker
      mainLogger.info('FASE 2: Creando contenedor PostgreSQL...');
      containerId = await dockerService.createPostgresContainer(
        submissionId,
        CONTAINER_CONFIG,
      );

      // FASE 3: Esperar PostgreSQL listo
      mainLogger.info('FASE 3: Esperando a que PostgreSQL esté listo...');
      const containerIp = await dockerService.getContainerIp(containerId);

      const isReady = await postgresHealthCheckService.waitForPostgresReady(
        containerIp,
        5432,
        30,
        60000,
      );

      if (!isReady) {
        throw new Error('PostgreSQL no estuvo listo en el tiempo establecido');
      }

      // FASE 4: Conectar y ejecutar SQL
      mainLogger.info('FASE 4: Conectando a PostgreSQL y ejecutando SQL...');
      await sqlExecutorService.connect(
        containerIp,
        5432,
        'eval_db',
        'eval_user',
        'eval_password',
        CONTAINER_CONFIG.timeout,
      );

      const sqlResult = await sqlExecutorService.executeFullPipeline(
        evaluationContext.schemaSql,
        evaluationContext.seedSql,
        evaluationContext.studentQuery,
        evaluationContext.challengeTimeLimit,
      );

      // FASE 5: Verificar errores SQL
      if (!sqlResult.success) {
        mainLogger.warn(`Error SQL: ${sqlResult.error}`);

        // Determina tipo de error
        let status: SubmissionStatus;
        if (sqlResult.error?.includes('TIME_LIMIT_EXCEEDED')) {
          status = SubmissionStatus.TIME_LIMIT_EXCEEDED;
        } else if (sqlResult.error?.includes('SYNTAX_ERROR')) {
          status = SubmissionStatus.SYNTAX_ERROR;
        } else {
          status = SubmissionStatus.RUNTIME_ERROR;
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

      // FASE 6: Comparar resultados
      mainLogger.info('FASE 6: Comparando resultados...');
      const comparisonResult = resultComparatorService.compare(
        {
          rows: sqlResult.rows,
          columns: sqlResult.columns,
        },
        evaluationContext.expectedResult ?? [],
      );

      // FASE 6.5: Hook al asistente IA (P1 — graceful degradation)
      // Si Pardo aún no entregó su módulo, seguimos sin él (no bloquea la evaluación).
      let aiQualityScore: {
        goodPractices?: number;
        clarity?: number;
        improvement?: number;
      } | null = null;

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
          const ai = await resp.json() as Record<string, any>;
          aiQualityScore = (ai['qualityScore'] as typeof aiQualityScore) ?? null;
          mainLogger.info('Asistente IA respondió ✓');
        } else {
          mainLogger.warn(`Asistente IA respondió ${resp.status} — continuando sin IA`);
        }
      } catch (e: any) {
        mainLogger.warn(`Asistente IA no disponible: ${e.message} — continuando sin IA`);
      }

      // FASE 7: Calcular score
      mainLogger.info('FASE 7: Calculando puntuación...');
      const scoreBreakdown = scoreCalculatorService.calculateScore({
        correctness: comparisonResult,
        executionTimeMs: sqlResult.executionTimeMs,
        timeLimit: evaluationContext.challengeTimeLimit,
        studentQuery: evaluationContext.studentQuery,
        expectedRowCount: evaluationContext.expectedResult?.length ?? 0,
        aiQualityScore,
      });

      const feedback = scoreCalculatorService.generateFeedback(
        scoreBreakdown,
        evaluationContext.studentQuery,
      );

      // FASE 8: Determinar status final
      const finalStatus = comparisonResult.isCorrect
        ? SubmissionStatus.ACCEPTED
        : sqlResult.executionTimeMs > evaluationContext.challengeTimeLimit
          ? SubmissionStatus.TIME_LIMIT_EXCEEDED
          : SubmissionStatus.WRONG_ANSWER;

      // FASE 9: Guardar resultados
      mainLogger.info('FASE 9: Guardando resultados en DB...');
      const submission = await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: finalStatus,
          score: scoreBreakdown.final,
          scoreBreakdown: scoreBreakdown as any, // Prisma JSON
          resultData: sqlResult.rows,
          executionTimeMs: sqlResult.executionTimeMs,
          errorMessage: feedback,
        },
      });

      mainLogger.success(
        `✅ Submission completado: ${finalStatus} (Score: ${scoreBreakdown.final}/100)`,
      );
      mainLogger.info(`Detalles: ${feedback}`);

      return submission;
    } catch (error: any) {
      mainLogger.error(`ERROR general: ${error.message}`);

      // Intenta guardar el error
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: SubmissionStatus.RUNTIME_ERROR,
            errorMessage: `Worker error: ${error.message}`,
          },
        });
      } catch (updateError) {
        mainLogger.error(`No se pudo actualizar submission: ${updateError}`);
      }

      throw error;
    } finally {
      // CLEANUP: Destruir contenedor siempre
      if (containerId) {
        mainLogger.info('CLEANUP: Destruyendo contenedor...');
        try {
          await sqlExecutorService.disconnect();
          await dockerService.destroyContainer(submissionId, true);
          mainLogger.success('Contenedor destruido ✓');
        } catch (cleanupError) {
          mainLogger.warn(`Error durante cleanup: ${cleanupError}`);
        }
      }
    }
  },
  {
    connection,
    concurrency: 2, // Máximo 2 submissions en paralelo
  },
);

// ============================================================
// EVENT HANDLERS
// ============================================================

worker.on('failed', (job, err) => {
  mainLogger.error(`Job ${job?.id} falló: ${err?.message}`);
});

worker.on('ready', () => {
  mainLogger.success(`✅ Worker listo. Escuchando cola "${SUBMISSIONS_QUEUE}"`);
});

worker.on('completed', (job) => {
  mainLogger.info(`Job ${job.id} completado`);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

const shutdown = async () => {
  mainLogger.info('\n⏹️  Iniciando shutdown graceful...');

  try {
    // Limpia todos los contenedores
    await dockerService.cleanupAllContainers();

    // Cierra worker
    await worker.close();

    // Desconecta Prisma
    await prisma.$disconnect();

    mainLogger.success('✅ Shutdown completado');
    process.exit(0);
  } catch (error) {
    mainLogger.error(`Error durante shutdown: ${error}`);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Obtiene el contexto completo para evaluación
 * Incluye: schema, seed, expectedResult, timeLimit, query
 */
async function getEvaluationContext(submissionId: string): Promise<EvaluationContext> {
  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      challenge: {
        include: {
          schema: true,
          // FIX P0: incluir el dataset más antiguo del reto (el seed real)
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

  // FIX P0: validar que haya TestDataset con SQL
  const dataset = submission.challenge.testDatasets[0];
  if (!dataset || !dataset.sql) {
    throw new Error(
      'Challenge no tiene TestDataset cargado; el runner no puede sembrar datos.',
    );
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
    seedSql: dataset.sql,  // FIX P0: ahora sí trae los INSERTs del TestDataset
    studentQuery: submission.query,
    expectedResult: submission.challenge.expectedResult as any[] | null | undefined,
    databaseEngine: submission.challenge.databaseEngine as any,
  };
}

