import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
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
import { FailedSubmissionsProducer } from '../infrastructure/queue/failed-submissions.producer';

/**
 * Endpoints administrativos para la DLQ "failed-submissions".
 *
 * Solo ADMIN. Permite:
 *   - listar jobs muertos,
 *   - reintentarlos manualmente (los reencola en la cola principal),
 *   - descartarlos definitivamente.
 *
 * El worker (Jose) será quien empuje a la DLQ cuando un job agote sus 3
 * reintentos automáticos con backoff exponencial.
 */
@ApiTags('admin · submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/submissions')
export class AdminSubmissionsController {
  constructor(private readonly dlq: FailedSubmissionsProducer) {}

  @Get('failed')
  @ApiOperation({ summary: 'Listar submissions en la DLQ (ADMIN)' })
  @ApiResponse({ status: 200, description: 'Lista de jobs en la cola failed-submissions' })
  async listFailed() {
    return { data: await this.dlq.listFailed() };
  }

  @Post('failed/:jobId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Reintentar manualmente un submission desde la DLQ (ADMIN)' })
  async retry(@Param('jobId') jobId: string) {
    try {
      return await this.dlq.retry(jobId);
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }

  @Delete('failed/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Descartar definitivamente un submission de la DLQ (ADMIN)' })
  async discard(@Param('jobId') jobId: string) {
    try {
      await this.dlq.discard(jobId);
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }
}
