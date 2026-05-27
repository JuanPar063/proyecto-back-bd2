import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/infrastructure/decorators/current-user.decorator';
import { EvaluationsService } from '../application/evaluations.service';
import {
  CreateEvaluationDto,
  SetEvaluationChallengesDto,
  UpdateEvaluationDto,
} from '../application/dto/evaluation.dto';

@ApiTags('evaluations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Post()
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Crear evaluacion/parcial (PROFESSOR)' })
  @ApiResponse({ status: 201, description: 'Evaluacion creada' })
  @ApiResponse({ status: 403, description: 'No es profesor del curso' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateEvaluationDto,
  ) {
    return this.evaluations.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar evaluaciones visibles segun rol',
    description:
      'PROFESSOR ve evaluaciones de sus cursos; STUDENT ve las de cursos donde esta inscrito; ADMIN ve todo.',
  })
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.evaluations.list({ id: user.id, role: user.role });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de evaluacion' })
  @ApiParam({ name: 'id', description: 'UUID de la evaluacion' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.evaluations.findOne(id, { id: user.id, role: user.role });
  }

  @Patch(':id')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Actualizar evaluacion (PROFESSOR)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateEvaluationDto,
  ) {
    return this.evaluations.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Eliminar evaluacion (PROFESSOR)' })
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.evaluations.remove(id, user.id);
  }

  @Patch(':id/challenges')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Asociar lista ordenada de retos a una evaluacion' })
  setChallenges(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetEvaluationChallengesDto,
  ) {
    return this.evaluations.setChallenges(id, user.id, dto);
  }

  @Post(':id/start')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Iniciar intento de evaluacion (STUDENT)' })
  @ApiResponse({ status: 201, description: 'Intento creado o intento activo devuelto' })
  @ApiResponse({ status: 400, description: 'Fuera de ventana o evaluacion sin retos' })
  @ApiResponse({ status: 409, description: 'Maximo de intentos alcanzado' })
  start(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.evaluations.start(id, user.id);
  }

  @Get(':id/state')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Estado de evaluacion para el estudiante' })
  state(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.evaluations.state(id, user.id);
  }
}
