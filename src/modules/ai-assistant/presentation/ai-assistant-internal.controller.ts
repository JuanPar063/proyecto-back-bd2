import { Body, Controller, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AiAssistantService } from '../application/ai-assistant.service';
import { AnalyzeQueryDto } from '../application/dto/analyze.dto';

/**
 * Endpoint INTERNO consumido por el worker (BullMQ) — sin auth.
 *
 * Por qué existe:
 *   El controller público `/ai-assistant/analyze` requiere JWT + rol
 *   PROFESSOR/ADMIN. El worker NO tiene credenciales (es un proceso de fondo
 *   detrás de la red docker), así que necesita un endpoint accesible sin
 *   token. Se monta bajo `/ai-assistant/internal/*` para que sea evidente
 *   en cualquier listado de rutas y los proxies/loadbalancers puedan
 *   filtrarlo del tráfico externo.
 *
 * Seguridad:
 *   El servicio docker-compose NO expone este endpoint al host (solo el
 *   puerto 3000 del API está bind-eado, pero el worker se conecta vía
 *   `http://api:3000/api/ai-assistant/internal/analyze` dentro de la red
 *   `proyecto-back-bd2_sqljudge`). En despliegues productivos hay que
 *   bloquearlo a nivel proxy (NGINX / Traefik) o agregar un guard de
 *   token de servicio.
 *
 * Marcado con `@ApiExcludeController` para que no aparezca en el Swagger
 * público (no es API de usuario).
 */
@ApiExcludeController()
@Controller('ai-assistant/internal')
export class AiAssistantInternalController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Post('analyze')
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
