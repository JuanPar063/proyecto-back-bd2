import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChallengeStatus,
  EvaluationResultsVisibility,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  CreateEvaluationDto,
  SetEvaluationChallengesDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto';

interface CurrentUser {
  id: string;
  role: Role;
}

@Injectable()
export class EvaluationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(professorId: string, dto: CreateEvaluationDto) {
    this.assertValidWindow(dto.startDate, dto.endDate);
    await this.assertCourseOwnership(dto.courseId, professorId);

    return this.prisma.evaluation.create({
      data: {
        name: dto.name,
        description: dto.description,
        courseId: dto.courseId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        durationMinutes: dto.durationMinutes,
        maxAttempts: dto.maxAttempts ?? 1,
        resultsVisibility:
          dto.resultsVisibility ?? EvaluationResultsVisibility.AFTER_END,
      },
      include: this.evaluationInclude(),
    });
  }

  async list(user: CurrentUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.evaluation.findMany({
        orderBy: { startDate: 'desc' },
        include: this.evaluationInclude(),
      });
    }

    if (user.role === Role.PROFESSOR) {
      return this.prisma.evaluation.findMany({
        where: { course: { professorId: user.id } },
        orderBy: { startDate: 'desc' },
        include: this.evaluationInclude(),
      });
    }

    return this.prisma.evaluation.findMany({
      where: {
        course: {
          enrollments: { some: { studentId: user.id } },
        },
      },
      orderBy: { startDate: 'desc' },
      include: this.evaluationInclude(),
    });
  }

  async findOne(id: string, user: CurrentUser) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: this.evaluationInclude(),
    });
    if (!evaluation) throw new NotFoundException('Evaluacion no encontrada');

    await this.assertEvaluationVisibleToUser(id, user);
    return evaluation;
  }

  async update(id: string, professorId: string, dto: UpdateEvaluationDto) {
    const evaluation = await this.assertEvaluationOwnership(id, professorId);
    const startDate = dto.startDate ?? evaluation.startDate;
    const endDate = dto.endDate ?? evaluation.endDate;
    this.assertValidWindow(startDate, endDate);

    return this.prisma.evaluation.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        startDate: dto.startDate,
        endDate: dto.endDate,
        durationMinutes: dto.durationMinutes,
        maxAttempts: dto.maxAttempts,
        resultsVisibility: dto.resultsVisibility,
      },
      include: this.evaluationInclude(),
    });
  }

  async remove(id: string, professorId: string) {
    await this.assertEvaluationOwnership(id, professorId);
    return this.prisma.evaluation.delete({ where: { id } });
  }

  async setChallenges(
    id: string,
    professorId: string,
    dto: SetEvaluationChallengesDto,
  ) {
    const evaluation = await this.assertEvaluationOwnership(id, professorId);
    const uniqueChallengeIds = [...new Set(dto.challengeIds)];

    if (uniqueChallengeIds.length !== dto.challengeIds.length) {
      throw new BadRequestException('La lista de retos contiene IDs repetidos');
    }

    const challenges = await this.prisma.challenge.findMany({
      where: { id: { in: uniqueChallengeIds } },
      select: {
        id: true,
        courseId: true,
        createdById: true,
        status: true,
      },
    });

    if (challenges.length !== uniqueChallengeIds.length) {
      throw new NotFoundException('Uno o mas retos no existen');
    }

    const invalid = challenges.find(
      (challenge) =>
        challenge.courseId !== evaluation.courseId ||
        challenge.createdById !== professorId ||
        challenge.status !== ChallengeStatus.published,
    );

    if (invalid) {
      throw new BadRequestException(
        'Todos los retos deben pertenecer al curso de la evaluacion, ser del profesor y estar publicados',
      );
    }

    await this.prisma.$transaction([
      this.prisma.evaluationChallenge.deleteMany({
        where: { evaluationId: id },
      }),
      this.prisma.evaluationChallenge.createMany({
        data: dto.challengeIds.map((challengeId, index) => ({
          evaluationId: id,
          challengeId,
          position: index + 1,
        })),
      }),
    ]);

    return this.prisma.evaluation.findUnique({
      where: { id },
      include: this.evaluationInclude(),
    });
  }

  async start(id: string, studentId: string) {
    const now = new Date();
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            enrollments: {
              where: { studentId },
              select: { id: true },
            },
          },
        },
        challenges: { select: { id: true }, take: 1 },
        attempts: {
          where: { studentId },
          orderBy: { attemptNumber: 'desc' },
        },
      },
    });

    if (!evaluation) throw new NotFoundException('Evaluacion no encontrada');
    if (evaluation.course.enrollments.length === 0) {
      throw new NotFoundException('Evaluacion no encontrada');
    }
    if (evaluation.challenges.length === 0) {
      throw new BadRequestException('La evaluacion aun no tiene retos asociados');
    }
    if (now < evaluation.startDate || now > evaluation.endDate) {
      throw new BadRequestException('La evaluacion no esta en su ventana activa');
    }

    const activeAttempt = evaluation.attempts.find(
      (attempt) => !attempt.submittedAt && attempt.endsAt > now,
    );
    if (activeAttempt) return activeAttempt;

    if (evaluation.attempts.length >= evaluation.maxAttempts) {
      throw new ConflictException('Ya alcanzaste el maximo de intentos');
    }

    const attemptNumber = evaluation.attempts.length + 1;
    const durationEndsAt = new Date(
      now.getTime() + evaluation.durationMinutes * 60_000,
    );
    const endsAt =
      durationEndsAt < evaluation.endDate ? durationEndsAt : evaluation.endDate;

    return this.prisma.evaluationAttempt.create({
      data: {
        evaluationId: id,
        studentId,
        attemptNumber,
        endsAt,
      },
    });
  }

  async state(id: string, studentId: string) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            enrollments: {
              where: { studentId },
              select: { id: true },
            },
          },
        },
        challenges: {
          orderBy: { position: 'asc' },
          include: {
            challenge: {
              select: {
                id: true,
                title: true,
                description: true,
                difficulty: true,
                timeLimit: true,
              },
            },
          },
        },
        attempts: {
          where: { studentId },
          orderBy: { attemptNumber: 'asc' },
          include: {
            submissions: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                challengeId: true,
                status: true,
                score: true,
                executionTimeMs: true,
                errorMessage: true,
                feedback: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!evaluation) throw new NotFoundException('Evaluacion no encontrada');
    if (evaluation.course.enrollments.length === 0) {
      throw new NotFoundException('Evaluacion no encontrada');
    }

    const now = new Date();
    const canSeeResults = this.canSeeResults(
      evaluation.resultsVisibility,
      evaluation.startDate,
      evaluation.endDate,
      now,
    );

    return {
      id: evaluation.id,
      name: evaluation.name,
      description: evaluation.description,
      course: evaluation.course,
      startDate: evaluation.startDate,
      endDate: evaluation.endDate,
      durationMinutes: evaluation.durationMinutes,
      maxAttempts: evaluation.maxAttempts,
      resultsVisibility: evaluation.resultsVisibility,
      canStart: now >= evaluation.startDate && now <= evaluation.endDate,
      attemptsUsed: evaluation.attempts.length,
      attemptsRemaining: Math.max(
        evaluation.maxAttempts - evaluation.attempts.length,
        0,
      ),
      activeAttempt:
        evaluation.attempts.find(
          (attempt) => !attempt.submittedAt && attempt.endsAt > now,
        ) ?? null,
      challenges: evaluation.challenges.map((item) => item.challenge),
      attempts: evaluation.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        startedAt: attempt.startedAt,
        endsAt: attempt.endsAt,
        submittedAt: attempt.submittedAt,
        submissions: canSeeResults
          ? attempt.submissions
          : attempt.submissions.map((submission) => ({
              id: submission.id,
              challengeId: submission.challengeId,
              status: submission.status,
              createdAt: submission.createdAt,
            })),
      })),
      resultsVisible: canSeeResults,
    };
  }

  private async assertCourseOwnership(courseId: string, professorId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Curso no encontrado');
    if (course.professorId !== professorId) {
      throw new ForbiddenException(
        'Solo el profesor del curso puede gestionar sus evaluaciones',
      );
    }
    return course;
  }

  private async assertEvaluationOwnership(id: string, professorId: string) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: { course: { select: { professorId: true } } },
    });
    if (!evaluation) throw new NotFoundException('Evaluacion no encontrada');
    if (evaluation.course.professorId !== professorId) {
      throw new ForbiddenException(
        'Solo el profesor del curso puede gestionar esta evaluacion',
      );
    }
    return evaluation;
  }

  private async assertEvaluationVisibleToUser(id: string, user: CurrentUser) {
    if (user.role === Role.ADMIN) return;

    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      select: {
        course: {
          select: {
            professorId: true,
            enrollments: {
              where: { studentId: user.id },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!evaluation) throw new NotFoundException('Evaluacion no encontrada');

    if (user.role === Role.PROFESSOR && evaluation.course.professorId !== user.id) {
      throw new NotFoundException('Evaluacion no encontrada');
    }
    if (user.role === Role.STUDENT && evaluation.course.enrollments.length === 0) {
      throw new NotFoundException('Evaluacion no encontrada');
    }
  }

  private assertValidWindow(startDate: Date, endDate: Date): void {
    if (startDate >= endDate) {
      throw new BadRequestException(
        'La fecha de inicio debe ser anterior a la fecha de cierre',
      );
    }
  }

  private canSeeResults(
    visibility: EvaluationResultsVisibility,
    startDate: Date,
    endDate: Date,
    now: Date,
  ): boolean {
    if (visibility === EvaluationResultsVisibility.ALWAYS) return true;
    if (visibility === EvaluationResultsVisibility.AFTER_END) return now > endDate;
    return now >= startDate && now <= endDate;
  }

  private evaluationInclude(): Prisma.EvaluationInclude {
    return {
      course: { select: { id: true, name: true, code: true, professorId: true } },
      challenges: {
        orderBy: { position: 'asc' },
        include: {
          challenge: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              status: true,
            },
          },
        },
      },
      attempts: { select: { id: true, studentId: true, attemptNumber: true } },
    };
  }
}
