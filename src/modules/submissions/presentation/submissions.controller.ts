import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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
import { CreateSubmissionDto } from '../application/dto/submission.dto';

@ApiTags('submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  /**
   * El estudiante envía su query SQL.
   * La API la registra como QUEUED y la manda a la cola.
   * Responde 202 Accepted — el resultado llega después via polling.
   */
  @Post()
  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enviar solución SQL para evaluación (STUDENT)' })
  @ApiResponse({ status: 202, description: 'Submission encolado. Haz polling a GET /submissions/:id' })
  submit(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.submissions.submit(user.id, dto);
  }

  /** El estudiante consulta el resultado de un submission propio */
  @Get('my')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Ver mis submissions (STUDENT)' })
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.submissions.findMine(user.id);
  }

  /** Polling: el estudiante consulta si ya se procesó su submission */
  @Get(':id')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Ver resultado de un submission propio (STUDENT)' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.submissions.findOne(id, user.id);
  }

  /** El profesor ve todos los submissions de un reto que creó */
  @Get('challenge/:challengeId')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Ver submissions de un reto (PROFESSOR)' })
  findByChallenge(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.submissions.findByChallenge(challengeId, user.id);
  }
}
