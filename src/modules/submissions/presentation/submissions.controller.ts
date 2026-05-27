import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { SubmissionsService } from '../application/submissions.service';
import {
  CreateSubmissionDto,
  ListSubmissionsQueryDto,
} from '../application/dto/submission.dto';

@ApiTags('submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post()
  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Enviar solución SQL para evaluación (STUDENT)',
    description:
      'Variante con challengeId en el body. La forma REST preferida es POST /challenges/:challengeId/submissions.',
  })
  @ApiResponse({
    status: 202,
    description: 'Submission encolada con status QUEUED. Hacer polling a GET /submissions/:id.',
  })
  @ApiResponse({ status: 400, description: 'Query no es SELECT o reto sin esquema/dataset/expected.' })
  @ApiResponse({ status: 403, description: 'Reto no publicado para este estudiante.' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado o estudiante no inscrito.' })
  submit(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.submissions.submit(user.id, dto);
  }

  @Get('my')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Ver mis submissions (STUDENT)' })
  @ApiResponse({ status: 200, description: 'Hasta 50 submissions del estudiante, más recientes primero.' })
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.submissions.findMine(user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar submissions con filtros',
    description:
      'STUDENT solo ve las suyas; PROFESSOR solo las de sus retos; ADMIN ve todo. Los filtros se aplican dentro del scope del rol.',
  })
  @ApiQuery({ name: 'challengeId', required: false, description: 'Filtrar por reto (UUID)' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filtrar por estudiante (PROFESSOR / ADMIN, UUID)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Tamaño de página (default 50, max 200)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset de página (default 0)' })
  @ApiResponse({ status: 200, description: 'Submissions visibles para el usuario, con filtros aplicados.' })
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListSubmissionsQueryDto,
  ) {
    return this.submissions.list({ id: user.id, role: user.role }, query);
  }

  @Get('challenge/:challengeId')
  @Roles(Role.PROFESSOR)
  @ApiOperation({
    summary: 'Submissions de un reto (PROFESSOR, ordenadas por score)',
    description: 'Atajo que devuelve todas las submissions de un reto del profesor, ordenadas por score desc y tiempo asc.',
  })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Submissions del reto, con datos del estudiante.' })
  @ApiResponse({ status: 403, description: 'No es el autor del reto.' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado.' })
  findByChallenge(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.submissions.findByChallenge(challengeId, user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un submission',
    description: 'Autorizado para: el autor, el profesor del reto, o ADMIN.',
  })
  @ApiParam({ name: 'id', description: 'UUID del submission', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Submission con datos del reto y del estudiante.' })
  @ApiResponse({ status: 404, description: 'Submission no encontrada (o sin permiso para verla).' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.submissions.findOne(id, { id: user.id, role: user.role });
  }
}
