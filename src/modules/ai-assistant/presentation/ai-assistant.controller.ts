import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
import { AiAssistantService } from '../application/ai-assistant.service';
import { AnalyzeQueryDto } from '../application/dto/analyze.dto';

/**
 * Endpoint interno para probar manualmente el asistente IA sin pasar por el
 * worker. Solo PROFESSOR y ADMIN. El flujo de producción es:
 *
 *     Worker --(AiAssistantPort)--> AiAssistantService
 *
 * Este controller existe para depuración y para que el equipo pueda iterar
 * reglas sin tener un runner real corriendo.
 */
@ApiTags('ai-assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Post('analyze')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  @ApiOperation({
    summary:
      'Analiza una query SQL y devuelve recomendaciones (uso interno / debug)',
  })
  @ApiResponse({ status: 201, description: 'Recomendaciones generadas' })
  analyze(@Body() dto: AnalyzeQueryDto) {
    return this.assistant.analyze({
      query: dto.query,
      schemaDdl: dto.schemaDdl,
      executionTimeMs: dto.executionTimeMs,
      explainPlan: dto.explainPlan ?? null,
      status: dto.status,
    });
  }
}
