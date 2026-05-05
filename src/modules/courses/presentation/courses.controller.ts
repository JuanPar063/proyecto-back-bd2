import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/infrastructure/decorators/current-user.decorator';
import { CoursesService } from '../application/courses.service';
import { CreateCourseDto, UpdateCourseDto } from '../application/dto/course.dto';

@ApiTags('courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Crear curso (PROFESSOR)' })
  create(@CurrentUser() u: CurrentUserPayload, @Body() dto: CreateCourseDto) {
    return this.courses.create(u.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cursos visibles según el rol' })
  list(@CurrentUser() u: CurrentUserPayload) {
    return this.courses.listForUser(u.id, u.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del curso' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    // TODO(Sofia): validar que el caller (STUDENT) esté inscrito
    return this.courses.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Actualizar curso (solo profesor del curso)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courses.update(id, u.id, dto);
  }

  @Patch(':id/archive')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Archivar curso (solo profesor del curso)' })
  archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: CurrentUserPayload,
  ) {
    return this.courses.archive(id, u.id);
  }

  // TODO(Sofia): POST /courses/:id/enrollments  -> inscribir estudiante (PROFESSOR)
  // TODO(Sofia): DELETE /courses/:id/enrollments/:studentId
  // TODO(Sofia): GET /courses/:id/students -> listar inscritos
}
