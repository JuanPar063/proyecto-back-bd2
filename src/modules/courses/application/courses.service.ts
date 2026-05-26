import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

/**
 * @responsable Sofia Palacio (redelegado por Pardo).
 *
 * Implementación inicial: CRUD básico con autorización por propiedad.
 * Pendiente:
 *   [ ] Validación de duplicado de code por periodo
 *   [x] Inscripción/desinscripción de estudiantes (Enrollment)
 *   [x] Filtrar listado para STUDENT a "cursos donde estoy inscrito"
 *   [x] Archivar curso (soft delete con isActive=false)
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
      return this.prisma.course.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    if (role === Role.PROFESSOR) {
      return this.prisma.course.findMany({
        where: { professorId: userId },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.course.findMany({
      where: {
        enrollments: {
          some: { studentId: userId },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId?: string, role?: Role) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        professor: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Curso no encontrado');
    }

    if (role === Role.PROFESSOR && course.professorId !== userId) {
      throw new ForbiddenException('Solo el profesor del curso puede verlo');
    }

    if (role === Role.STUDENT) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          courseId: id,
          studentId: userId!,
        },
      });

      if (!enrollment) {
        throw new ForbiddenException(
          'El estudiante no está inscrito en este curso',
        );
      }
    }

    return course;
  }

  async update(id: string, professorId: string, dto: UpdateCourseDto) {
    const course = await this.findOne(id);

    if (course.professorId !== professorId) {
      throw new ForbiddenException(
        'Solo el profesor del curso puede modificarlo',
      );
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
      throw new ForbiddenException(
        'Solo el profesor del curso puede archivarlo',
      );
    }

    return this.prisma.course.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async enrollStudent(
    courseId: string,
    professorId: string,
    studentEmail: string,
  ) {
    const course = await this.findOne(courseId);

    if (course.professorId !== professorId) {
      throw new ForbiddenException(
        'Solo el profesor del curso puede inscribir estudiantes',
      );
    }

    const student = await this.prisma.user.findUnique({
      where: { email: studentEmail },
    });

    if (!student) {
      throw new NotFoundException('Estudiante no encontrado');
    }

    if (student.role !== Role.STUDENT) {
      throw new BadRequestException('El usuario indicado no tiene rol STUDENT');
    }

    if (!student.isActive) {
      throw new BadRequestException('El estudiante no está activo');
    }

    const existingEnrollment = await this.prisma.enrollment.findFirst({
      where: {
        courseId,
        studentId: student.id,
      },
    });

    if (existingEnrollment) {
      throw new ConflictException(
        'El estudiante ya está inscrito en este curso',
      );
    }

    return this.prisma.enrollment.create({
      data: {
        courseId,
        studentId: student.id,
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        course: {
          select: {
            id: true,
            name: true,
            code: true,
            period: true,
            groupName: true,
          },
        },
      },
    });
  }

  async unenrollStudent(
    courseId: string,
    professorId: string,
    studentId: string,
  ) {
    const course = await this.findOne(courseId);

    if (course.professorId !== professorId) {
      throw new ForbiddenException(
        'Solo el profesor del curso puede desinscribir estudiantes',
      );
    }

    const result = await this.prisma.enrollment.deleteMany({
      where: {
        courseId,
        studentId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        'El estudiante no está inscrito en este curso',
      );
    }

    return {
      message: 'Estudiante desinscrito correctamente',
      courseId,
      studentId,
    };
  }

  async listStudents(courseId: string, userId: string, role: Role) {
    const course = await this.findOne(courseId);

    if (role === Role.PROFESSOR && course.professorId !== userId) {
      throw new ForbiddenException(
        'Solo el profesor del curso puede ver los estudiantes inscritos',
      );
    }

    if (role === Role.STUDENT) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          courseId,
          studentId: userId,
        },
      });

      if (!enrollment) {
        throw new ForbiddenException(
          'El estudiante no está inscrito en este curso',
        );
      }
    }

    return this.prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        enrolledAt: 'desc',
      },
    });
  }
}