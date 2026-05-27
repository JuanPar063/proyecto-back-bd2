import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, Role, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  CreateSubmissionDto,
  ListSubmissionsQueryDto,
  SubmitFromChallengeDto,
  UpsertExpectedResultDto,
} from './dto/submission.dto';

/** Nombre de la cola — debe coincidir exactamente con el worker. */
export const SUBMISSIONS_QUEUE = 'submissions';

/** Estados terminales y transitorios — usado por el guard de transiciones. */
export const TERMINAL_STATUSES: ReadonlyArray<SubmissionStatus> = [
  SubmissionStatus.ACCEPTED,
  SubmissionStatus.WRONG_ANSWER,
  SubmissionStatus.SYNTAX_ERROR,
  SubmissionStatus.TIME_LIMIT_EXCEEDED,
  SubmissionStatus.RUNTIME_ERROR,
  SubmissionStatus.OPTIMIZATION_REQUIRED,
];

/**
 * Reglas de transición de Submission. Centralizadas aquí para que
 * el worker (Jose) las use vía `assertValidTransition` y no se le
 * cuele un estado raro como ACCEPTED → WRONG_ANSWER.
 */
const TRANSITIONS: Record<SubmissionStatus, ReadonlyArray<SubmissionStatus>> = {
  [SubmissionStatus.QUEUED]: [SubmissionStatus.RUNNING],
  [SubmissionStatus.RUNNING]: [...TERMINAL_STATUSES],
  [SubmissionStatus.ACCEPTED]: [],
  [SubmissionStatus.WRONG_ANSWER]: [],
  [SubmissionStatus.SYNTAX_ERROR]: [],
  [SubmissionStatus.TIME_LIMIT_EXCEEDED]: [],
  [SubmissionStatus.RUNTIME_ERROR]: [],
  [SubmissionStatus.OPTIMIZATION_REQUIRED]: [],
};

/** Útil para el worker: lanza si el cambio de estado es inválido. */
export function assertValidTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(
      `Transición inválida de Submission: ${from} → ${to}`,
    );
  }
}

interface CurrentUser {
  id: string;
  role: Role;
}

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SUBMISSIONS_QUEUE)
    private readonly queue: Queue,
  ) {}

  // -------------------------------------------------------------------------
  // Envío de soluciones (STUDENT)
  // -------------------------------------------------------------------------

  /** Variante body: POST /submissions con {challengeId, query}. */
  submit(studentId: string, dto: CreateSubmissionDto) {
    return this.submitForChallenge(studentId, dto.challengeId, {
      query: dto.query,
      evaluationId: dto.evaluationId,
    });
  }

  /**
   * Variante REST-ish: POST /challenges/:challengeId/submissions.
   * Esta es la forma "preferida" según el plan del Entregable 2.
   */
  async submitForChallenge(
    studentId: string,
    challengeId: string,
    dto: SubmitFromChallengeDto,
  ) {
    this.assertSelectOnly(dto.query);

    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        schema: { select: { id: true } },
        testDatasets: { select: { id: true }, take: 1 },
        expectedResult: { select: { id: true } },
        course: {
          select: {
            id: true,
            enrollments: {
              where: { studentId },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.status !== 'published') {
      throw new ForbiddenException('El reto no está disponible para envío');
    }
    if (challenge.course.enrollments.length === 0) {
      // No leakeamos información del reto al alumno no inscrito.
      throw new NotFoundException('Reto no encontrado');
    }
    if (!challenge.schema) {
      throw new BadRequestException(
        'El reto aún no tiene esquema cargado; no se pueden recibir envíos.',
      );
    }
    if (challenge.testDatasets.length === 0) {
      throw new BadRequestException(
        'El reto aún no tiene datos de prueba cargados; no se pueden recibir envíos.',
      );
    }
    if (!challenge.expectedResult) {
      throw new BadRequestException(
        'El reto aún no tiene resultado esperado cargado; no se pueden recibir envíos.',
      );
    }

    const evaluationAttemptId = await this.resolveEvaluationAttemptId(
      dto.evaluationId,
      studentId,
      challengeId,
    );

    const submission = await this.prisma.submission.create({
      data: {
        studentId,
        challengeId,
        evaluationAttemptId,
        query: dto.query,
        status: SubmissionStatus.QUEUED,
        engine: challenge.databaseEngine,
      },
    });

    await this.queue.add(
      'evaluate',
      { submissionId: submission.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return submission;
  }

  // -------------------------------------------------------------------------
  // Consulta de submissions
  // -------------------------------------------------------------------------

  /**
   * Detalle: autorizado para el propio autor, para el profesor dueño
   * del reto, o para ADMIN. Para los demás → 404 (no leakear existencia).
   */
  async findOne(id: string, user: CurrentUser) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        challenge: {
          select: {
            id: true,
            title: true,
            courseId: true,
            createdById: true,
            timeLimit: true,
          },
        },
        student: { select: { id: true, fullName: true, email: true } },
        evaluationAttempt: {
          select: {
            id: true,
            evaluationId: true,
            attemptNumber: true,
            startedAt: true,
            endsAt: true,
          },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission no encontrada');

    const isAuthor = submission.studentId === user.id;
    const isProfessor =
      user.role === Role.PROFESSOR && submission.challenge.createdById === user.id;
    const isAdmin = user.role === Role.ADMIN;

    if (!isAuthor && !isProfessor && !isAdmin) {
      throw new NotFoundException('Submission no encontrada');
    }

    return submission;
  }

  /**
   * Listado con filtros (challengeId, studentId). Las reglas de visibilidad
   * son las que evitan information leakage entre estudiantes:
   *   - STUDENT: siempre filtra studentId = self (ignora si pidió otro).
   *   - PROFESSOR: solo ve submissions de retos creados por él.
   *   - ADMIN: ve todo.
   */
  async list(user: CurrentUser, filters: ListSubmissionsQueryDto) {
    const where: Prisma.SubmissionWhereInput = {};

    if (filters.challengeId) where.challengeId = filters.challengeId;

    if (user.role === Role.STUDENT) {
      where.studentId = user.id;
    } else if (user.role === Role.PROFESSOR) {
      where.challenge = { createdById: user.id };
      if (filters.studentId) where.studentId = filters.studentId;
    } else if (user.role === Role.ADMIN) {
      if (filters.studentId) where.studentId = filters.studentId;
    }

    return this.prisma.submission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
      include: {
        challenge: { select: { id: true, title: true, courseId: true } },
        student: { select: { id: true, fullName: true, email: true } },
        evaluationAttempt: {
          select: { id: true, evaluationId: true, attemptNumber: true },
        },
      },
    });
  }

  /** Atajo /submissions/my — equivale a list con studentId = self. */
  findMine(studentId: string) {
    return this.prisma.submission.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        challenge: { select: { id: true, title: true } },
        evaluationAttempt: {
          select: { id: true, evaluationId: true, attemptNumber: true },
        },
      },
    });
  }

  /** Atajo profesor: todas las submissions de un reto suyo, ordenadas por score. */
  async findByChallenge(challengeId: string, professorId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.createdById !== professorId) {
      throw new ForbiddenException(
        'Solo el autor del reto puede ver sus submissions',
      );
    }
    return this.prisma.submission.findMany({
      where: { challengeId },
      orderBy: [{ score: 'desc' }, { executionTimeMs: 'asc' }],
      include: { student: { select: { id: true, fullName: true, email: true } } },
    });
  }

  // -------------------------------------------------------------------------
  // Expected Result (carga / consulta por el profesor)
  // -------------------------------------------------------------------------

  async upsertExpectedResult(
    challengeId: string,
    professorId: string,
    dto: UpsertExpectedResultDto,
  ) {
    await this.assertChallengeOwnership(challengeId, professorId);
    this.assertExpectedShape(dto);

    return this.prisma.expectedResult.upsert({
      where: { challengeId },
      create: {
        challengeId,
        columns: dto.columns,
        rows: dto.rows as unknown as Prisma.InputJsonValue,
        orderSensitive: dto.orderSensitive ?? false,
        floatTolerance: dto.floatTolerance ?? 0,
      },
      update: {
        columns: dto.columns,
        rows: dto.rows as unknown as Prisma.InputJsonValue,
        orderSensitive: dto.orderSensitive ?? false,
        floatTolerance: dto.floatTolerance ?? 0,
      },
    });
  }

  async getExpectedResult(challengeId: string, professorId: string) {
    await this.assertChallengeOwnership(challengeId, professorId);
    const expected = await this.prisma.expectedResult.findUnique({
      where: { challengeId },
    });
    if (!expected) {
      throw new NotFoundException(
        'Este reto aún no tiene resultado esperado cargado.',
      );
    }
    return expected;
  }

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  private async assertChallengeOwnership(challengeId: string, professorId: string) {
    const c = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!c) throw new NotFoundException('Reto no encontrado');
    if (c.createdById !== professorId) {
      throw new ForbiddenException(
        'Solo el autor del reto puede modificar su resultado esperado',
      );
    }
    return c;
  }

  private async resolveEvaluationAttemptId(
    evaluationId: string | undefined,
    studentId: string,
    challengeId: string,
  ): Promise<string | undefined> {
    if (!evaluationId) return undefined;

    const now = new Date();
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        course: {
          select: {
            enrollments: {
              where: { studentId },
              select: { id: true },
            },
          },
        },
        challenges: {
          where: { challengeId },
          select: { id: true },
        },
        attempts: {
          where: {
            studentId,
            submittedAt: null,
            endsAt: { gt: now },
          },
          orderBy: { attemptNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!evaluation) throw new NotFoundException('Evaluacion no encontrada');
    if (evaluation.course.enrollments.length === 0) {
      throw new NotFoundException('Evaluacion no encontrada');
    }
    if (now < evaluation.startDate || now > evaluation.endDate) {
      throw new BadRequestException('La evaluacion no esta en su ventana activa');
    }
    if (evaluation.challenges.length === 0) {
      throw new BadRequestException(
        'El reto no pertenece a la evaluacion indicada',
      );
    }

    const activeAttempt = evaluation.attempts[0];
    if (!activeAttempt) {
      throw new BadRequestException(
        'Debes iniciar la evaluacion antes de enviar submissions',
      );
    }

    return activeAttempt.id;
  }

  /**
   * Valida coherencia interna del expected: cada fila debe tener la
   * misma cardinalidad que `columns`. No valida tipos: el comparador
   * los normaliza en runtime.
   */
  private assertExpectedShape(dto: UpsertExpectedResultDto): void {
    const ncols = dto.columns.length;
    const dup = dto.columns.filter(
      (c, i) => dto.columns.findIndex((x) => x.trim().toLowerCase() === c.trim().toLowerCase()) !== i,
    );
    if (dup.length > 0) {
      throw new BadRequestException(
        `Las columnas tienen nombres duplicados (case-insensitive): ${dup.join(', ')}`,
      );
    }
    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];
      if (!Array.isArray(row)) {
        throw new BadRequestException(`rows[${i}] debe ser un arreglo`);
      }
      if (row.length !== ncols) {
        throw new BadRequestException(
          `rows[${i}] tiene ${row.length} celda(s); se esperaban ${ncols}.`,
        );
      }
    }
  }

  /**
   * Pre-validación textual: la query debe ser un SELECT (o WITH … SELECT).
   * El parser real lo aplica el worker; aquí solo protegemos la cola
   * para evitar encolar trabajos obviamente inválidos.
   */
  private assertSelectOnly(query: string): void {
    const cleaned = query
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .trim()
      .toLowerCase();
    if (!cleaned.startsWith('select') && !cleaned.startsWith('with')) {
      throw new BadRequestException(
        'Solo se aceptan consultas SELECT (o WITH ... SELECT) para evaluación automática.',
      );
    }
    const forbidden = /\b(drop|delete|update|alter|truncate|insert|grant|revoke|create|copy)\b/i;
    if (forbidden.test(cleaned)) {
      throw new BadRequestException(
        'La query contiene palabras clave no permitidas (DDL/DML). Solo SELECT/WITH.',
      );
    }
  }
}
