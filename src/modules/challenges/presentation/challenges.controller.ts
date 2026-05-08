import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import { ChallengesService } from '../application/challenges.service';
import {
  ChangeStatusDto,
  CreateChallengeDto,
  UpdateChallengeDto,
} from '../application/dto/challenge.dto';

@ApiTags('challenges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Post()
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Crear reto SQL en un curso (PROFESSOR)' })
  @ApiResponse({ status: 201, description: 'Reto creado en estado draft' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 403, description: 'No es profesor del curso destino' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  create(@CurrentUser() u: CurrentUserPayload, @Body() dto: CreateChallengeDto) {
    return this.challenges.create(u.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar retos visibles según rol',
    description:
      'PROFESSOR ve sus propios retos; STUDENT ve solo retos publicados de cursos donde está inscrito; ADMIN ve todo.',
  })
  @ApiQuery({ name: 'courseId', required: false, description: 'Filtrar por curso' })
  @ApiResponse({ status: 200, description: 'Lista de retos visibles' })
  list(@CurrentUser() u: CurrentUserPayload, @Query('courseId') courseId?: string) {
    return this.challenges.listForUser(u.id, u.role, courseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de reto (filtrado por rol)' })
  @ApiParam({ name: 'id', description: 'UUID del reto' })
  @ApiResponse({ status: 200, description: 'Reto autorizado para el usuario' })
  @ApiResponse({
    status: 404,
    description:
      'Reto no encontrado, o no autorizado (STUDENT no inscrito / no publicado, PROFESSOR ajeno)',
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: CurrentUserPayload,
  ) {
    return this.challenges.findOne(id, u.id, u.role);
  }

  @Patch(':id')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Editar reto (solo autor)' })
  @ApiParam({ name: 'id', description: 'UUID del reto' })
  @ApiResponse({ status: 200, description: 'Reto actualizado' })
  @ApiResponse({ status: 400, description: 'Reto archivado / datos inválidos' })
  @ApiResponse({ status: 403, description: 'No es el autor del reto' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: UpdateChallengeDto,
  ) {
    return this.challenges.update(id, u.id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.PROFESSOR)
  @ApiOperation({
    summary: 'Transicionar estado del reto',
    description:
      'Transiciones permitidas: draft→published, draft→archived, published→archived. archived es terminal. Bloquea archive si hay submissions QUEUED o RUNNING.',
  })
  @ApiParam({ name: 'id', description: 'UUID del reto' })
  @ApiResponse({ status: 200, description: 'Estado cambiado' })
  @ApiResponse({
    status: 400,
    description: 'Transición inválida o submissions activas en intento de archivar',
  })
  @ApiResponse({ status: 403, description: 'No es el autor del reto' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado' })
  changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.challenges.changeStatus(id, u.id, dto);
  }
}
