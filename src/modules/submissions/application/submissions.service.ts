import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CreateSubmissionDto } from './dto/submission.dto';

// Nombre de la cola — debe coincidir exactamente con el worker/src/main.ts
export const SUBMISSIONS_QUEUE = 'submissions';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SUBMISSIONS_QUEUE)
    private readonly queue: Queue,
  ) {}

  /**
   * Recibe la query del estudiante:
   * 1. Valida que el reto exista y esté publicado
   * 2. Guarda el Submission en DB con status QUEUED
   * 3. Encola el job en Redis para que el worker lo procese
   * 4. Retorna el submission creado (el estudiante puede hacer polling)
   */
  async submit(studentId: string, dto: CreateSubmissionDto) {
    // Verificar que el reto existe y está publicado
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: dto.challengeId },
    });
    if (!challenge) {
      throw new NotFoundException('Reto no encontrado');
    }
    if (challenge.status !== 'published') {
      throw new ForbiddenException('El reto no está disponible');
    }

    // Guardar en la base de datos con status inicial QUEUED
    const submission = await this.prisma.submission.create({
      data: {
        studentId,
        challengeId: dto.challengeId,
        query: dto.query,
        status: 'QUEUED',
      },
    });

    // Encolar en Redis — el worker recibe { submissionId } y hace el resto
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

  /** El estudiante hace polling a este endpoint para ver si ya terminó */
  async findOne(id: string, studentId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: { challenge: { select: { title: true, courseId: true } } },
    });

    if (!submission) throw new NotFoundException('Submission no encontrado');

    // Solo el propio estudiante puede ver su submission
    if (submission.studentId !== studentId) {
      throw new ForbiddenException('No tienes acceso a este submission');
    }

    return submission;
  }

  /** Listar mis submissions (el estudiante ve su historial) */
  async findMine(studentId: string) {
    return this.prisma.submission.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { challenge: { select: { title: true } } },
    });
  }

  /** Para el profesor: ver submissions de un reto específico */
  async findByChallenge(challengeId: string, professorId: string) {
    // Verificar que el profesor es dueño del reto
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.createdById !== professorId) {
      throw new ForbiddenException('Solo el autor del reto puede ver sus submissions');
    }

    return this.prisma.submission.findMany({
      where: { challengeId },
      orderBy: [{ score: 'desc' }, { executionTimeMs: 'asc' }],
      include: { student: { select: { fullName: true, email: true } } },
    });
  }
}
