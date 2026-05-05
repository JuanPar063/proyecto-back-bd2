import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChallengeStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  ChangeStatusDto,
  CreateChallengeDto,
  UpdateChallengeDto,
} from './dto/challenge.dto';

/**
 * @responsable Ruiz Akle, Juan (redelegado por Pardo).
 *
 * Implementación inicial. Pendiente:
 *   [ ] Validar que el PROFESSOR sea dueño del Course al crear
 *   [ ] Endurecer reglas de transición y permisos en changeStatus
 *   [ ] Bloquear archive si hay submissions activas
 *   [ ] Listado para STUDENT: solo retos PUBLISHED de cursos donde está inscrito
 */
@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  // Reglas de transición permitidas
  private readonly transitions: Record<ChallengeStatus, ChallengeStatus[]> = {
    [ChallengeStatus.draft]: [ChallengeStatus.published, ChallengeStatus.archived],
    [ChallengeStatus.published]: [ChallengeStatus.archived],
    [ChallengeStatus.archived]: [],
  };

  async create(professorId: string, dto: CreateChallengeDto) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });
    if (!course) throw new NotFoundException('Curso no encontrado');
    if (course.professorId !== professorId) {
      throw new ForbiddenException('Solo el profesor del curso puede crear retos en él');
    }

    return this.prisma.challenge.create({
      data: {
        title: dto.title,
        description: dto.description,
        difficulty: dto.difficulty,
        tags: dto.tags,
        databaseEngine: dto.databaseEngine ?? 'postgresql',
        timeLimit: dto.timeLimit ?? 2000,
        status: ChallengeStatus.draft,
        courseId: dto.courseId,
        createdById: professorId,
      },
    });
  }

  async listForUser(userId: string, role: Role, courseId?: string) {
    if (role === Role.PROFESSOR) {
      return this.prisma.challenge.findMany({
        where: { createdById: userId, ...(courseId && { courseId }) },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (role === Role.STUDENT) {
      return this.prisma.challenge.findMany({
        where: {
          status: ChallengeStatus.published,
          course: { enrollments: { some: { studentId: userId } } },
          ...(courseId && { courseId }),
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.challenge.findMany({
      where: courseId ? { courseId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const c = await this.prisma.challenge.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Reto no encontrado');
    return c;
  }

  async update(id: string, professorId: string, dto: UpdateChallengeDto) {
    const c = await this.findOne(id);
    if (c.createdById !== professorId) {
      throw new ForbiddenException('Solo el autor del reto puede editarlo');
    }
    if (c.status === ChallengeStatus.archived) {
      throw new BadRequestException('No se puede editar un reto archivado');
    }
    return this.prisma.challenge.update({ where: { id }, data: dto });
  }

  async changeStatus(id: string, professorId: string, dto: ChangeStatusDto) {
    const c = await this.findOne(id);
    if (c.createdById !== professorId) {
      throw new ForbiddenException('Solo el autor del reto puede cambiar su estado');
    }
    if (!this.transitions[c.status].includes(dto.status)) {
      throw new BadRequestException(
        `Transición inválida: ${c.status} -> ${dto.status}`,
      );
    }
    // TODO(Ruiz): bloquear si dto.status === archived y hay submissions activas
    return this.prisma.challenge.update({
      where: { id },
      data: { status: dto.status },
    });
  }
}
