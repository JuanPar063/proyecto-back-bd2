import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Difficulty,
  EvaluationResultsVisibility,
  SubmissionStatus,
} from '@prisma/client';
import { EvaluationsService } from './evaluations.service';

describe('EvaluationsService', () => {
  let prisma: {
    evaluation: {
      findUnique: jest.Mock;
    };
    evaluationAttempt: {
      create: jest.Mock;
    };
  };
  let service: EvaluationsService;

  const now = new Date('2026-05-26T18:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    prisma = {
      evaluation: {
        findUnique: jest.fn(),
      },
      evaluationAttempt: {
        create: jest.fn(),
      },
    };

    service = new EvaluationsService(prisma as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('bloquea inicio fuera de la ventana de fechas', async () => {
    prisma.evaluation.findUnique.mockResolvedValue({
      id: 'evaluation-1',
      startDate: new Date('2026-05-27T18:00:00.000Z'),
      endDate: new Date('2026-05-27T20:00:00.000Z'),
      durationMinutes: 90,
      maxAttempts: 2,
      course: { enrollments: [{ id: 'enrollment-1' }] },
      challenges: [{ id: 'evaluation-challenge-1' }],
      attempts: [],
    });

    await expect(service.start('evaluation-1', 'student-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.evaluationAttempt.create).not.toHaveBeenCalled();
  });

  it('bloquea el tercer intento cuando maxAttempts es 2', async () => {
    prisma.evaluation.findUnique.mockResolvedValue({
      id: 'evaluation-1',
      startDate: new Date('2026-05-26T17:00:00.000Z'),
      endDate: new Date('2026-05-26T20:00:00.000Z'),
      durationMinutes: 60,
      maxAttempts: 2,
      course: { enrollments: [{ id: 'enrollment-1' }] },
      challenges: [{ id: 'evaluation-challenge-1' }],
      attempts: [
        {
          id: 'attempt-2',
          studentId: 'student-1',
          attemptNumber: 2,
          submittedAt: new Date('2026-05-26T17:50:00.000Z'),
          endsAt: new Date('2026-05-26T18:00:00.000Z'),
        },
        {
          id: 'attempt-1',
          studentId: 'student-1',
          attemptNumber: 1,
          submittedAt: new Date('2026-05-26T17:20:00.000Z'),
          endsAt: new Date('2026-05-26T17:30:00.000Z'),
        },
      ],
    });

    await expect(service.start('evaluation-1', 'student-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.evaluationAttempt.create).not.toHaveBeenCalled();
  });

  it('oculta score, tiempo y feedback cuando resultsVisibility es AFTER_END antes del cierre', async () => {
    prisma.evaluation.findUnique.mockResolvedValue({
      id: 'evaluation-1',
      name: 'Parcial 1',
      description: 'Consultas SQL',
      startDate: new Date('2026-05-26T17:00:00.000Z'),
      endDate: new Date('2026-05-26T20:00:00.000Z'),
      durationMinutes: 90,
      maxAttempts: 2,
      resultsVisibility: EvaluationResultsVisibility.AFTER_END,
      course: {
        id: 'course-1',
        name: 'Bases de Datos II',
        enrollments: [{ id: 'enrollment-1' }],
      },
      challenges: [
        {
          challenge: {
            id: 'challenge-1',
            title: 'Clientes activos',
            description: 'Consulta clientes activos',
            difficulty: Difficulty.EASY,
            timeLimit: 2000,
          },
        },
      ],
      attempts: [
        {
          id: 'attempt-1',
          attemptNumber: 1,
          startedAt: new Date('2026-05-26T17:05:00.000Z'),
          endsAt: new Date('2026-05-26T18:35:00.000Z'),
          submittedAt: null,
          submissions: [
            {
              id: 'submission-1',
              challengeId: 'challenge-1',
              status: SubmissionStatus.ACCEPTED,
              score: 100,
              executionTimeMs: 120,
              errorMessage: null,
              feedback: 'Buen uso de indices',
              createdAt: new Date('2026-05-26T17:10:00.000Z'),
            },
          ],
        },
      ],
    });

    const result = await service.state('evaluation-1', 'student-1');
    const submission = result.attempts[0].submissions[0];

    expect(result.resultsVisible).toBe(false);
    expect(submission).toEqual({
      id: 'submission-1',
      challengeId: 'challenge-1',
      status: SubmissionStatus.ACCEPTED,
      createdAt: new Date('2026-05-26T17:10:00.000Z'),
    });
    expect(submission).not.toHaveProperty('score');
    expect(submission).not.toHaveProperty('executionTimeMs');
    expect(submission).not.toHaveProperty('feedback');
  });
});
