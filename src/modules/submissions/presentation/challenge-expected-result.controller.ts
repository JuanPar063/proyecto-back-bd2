import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
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
import { SubmissionsService } from '../application/submissions.service';
import { UpsertExpectedResultDto } from '../application/dto/submission.dto';

/**
 * Endpoints para que el PROFESSOR cargue / consulte el resultado de
 * referencia (filas + columnas) que el comparador usa para decidir
 * ACCEPTED vs WRONG_ANSWER. Es prerequisito para que un reto reciba
 * envíos.
 */
@ApiTags('submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('challenges/:challengeId/expected-result')
export class ChallengeExpectedResultController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Put()
  @Roles(Role.PROFESSOR)
  @ApiOperation({
    summary: 'Cargar / actualizar el resultado esperado del reto (PROFESSOR)',
    description:
      'Sobreescribe el resultado esperado existente. Útil para iterar mientras se afina el dataset.',
  })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Resultado esperado guardado.' })
  @ApiResponse({ status: 400, description: 'Columnas duplicadas o filas con cardinalidad incorrecta.' })
  @ApiResponse({ status: 403, description: 'No es el autor del reto.' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado.' })
  upsert(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertExpectedResultDto,
  ) {
    return this.submissions.upsertExpectedResult(challengeId, user.id, dto);
  }

  @Get()
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Consultar el resultado esperado del reto (PROFESSOR)' })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Resultado esperado registrado.' })
  @ApiResponse({ status: 403, description: 'No es el autor del reto.' })
  @ApiResponse({ status: 404, description: 'Reto sin resultado esperado cargado.' })
  get(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.submissions.getExpectedResult(challengeId, user.id);
  }
}
