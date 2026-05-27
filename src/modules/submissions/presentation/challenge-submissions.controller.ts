import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { SubmissionsService } from '../application/submissions.service';
import { SubmitFromChallengeDto } from '../application/dto/submission.dto';

/**
 * Variante REST-ish para enviar una submission: el reto va en la URL.
 * Convive con POST /submissions (legacy). Recomendado para clientes nuevos.
 */
@ApiTags('submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('challenges/:challengeId/submissions')
export class ChallengeSubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post()
  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Enviar solución SQL a un reto (STUDENT)',
    description:
      'Encola la query del estudiante para evaluación asíncrona. Responde 202 — el resultado se consulta vía GET /submissions/:id.',
  })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto', format: 'uuid' })
  @ApiResponse({ status: 202, description: 'Submission encolada con status QUEUED.' })
  @ApiResponse({
    status: 400,
    description:
      'Query no es SELECT, o el reto aún no tiene esquema / datos de prueba / resultado esperado.',
  })
  @ApiResponse({ status: 403, description: 'Reto no publicado.' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado o estudiante no inscrito.' })
  submit(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitFromChallengeDto,
  ) {
    return this.submissions.submitForChallenge(user.id, challengeId, dto);
  }
}
