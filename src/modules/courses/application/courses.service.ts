import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

/**
 * @responsable Sofia Palacio (redelegado por Pardo).
 *
 * Implementación inicial: CRUD básico con autorización por propiedad.
 * Pendiente:
 *   [ ] Validación de duplicado de code por periodo
 *   [ ] Inscripción/desinscripción de estudiantes (Enrollment)
 *   [ ] Filtrar listado para STUDENT a "cursos donde estoy inscrito"
 *   [ ] Archivar curso (soft delete con isActive=false)
 */
@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(professorId: string, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        name: dto.name,
        code: dto.code,
        period: dto.period,
        groupName: dto.group,
        professorId,
      },
    });
  }

  async listForUser(userId: string, role: Role) {
    if (role === Role.ADMIN) {
      return this.prisma.course.findMany({ orderBy: { createdAt: 'desc' } });
    }
    if (role === Role.PROFESSOR) {
      return this.prisma.course.findMany({
        where: { professorId: userId },
        orderBy: { createdAt: 'desc' },
      });
    }
    // STUDENT
    return this.prisma.course.findMany({
      where: { enrollments: { some: { studentId: userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Curso no encontrado');
    return course;
  }

  async update(id: string, professorId: string, dto: UpdateCourseDto) {
    const course = await this.findOne(id);
    if (course.professorId !== professorId) {
      throw new ForbiddenException('Solo el profesor del curso puede modificarlo');
    }
    return this.prisma.course.update({
      where: { id },
      data: {
        name: dto.name,
        period: dto.period,
        groupName: dto.group,
      },
    });
  }

  async archive(id: string, professorId: string) {
    const course = await this.findOne(id);
    if (course.professorId !== professorId) {
      throw new ForbiddenException('Solo el profesor del curso puede archivarlo');
    }
    return this.prisma.course.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // TODO(Sofia): inscribir estudiante
  // async enrollStudent(courseId: string, professorId: string, studentEmail: string) { ... }

  // TODO(Sofia): desinscribir estudiante
  // async unenrollStudent(courseId: string, professorId: string, studentId: string) { ... }
}
