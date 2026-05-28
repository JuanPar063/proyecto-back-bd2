import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import {
  RECOMMENDATION_REPOSITORY,
  type RecommendationRepository,
} from '../domain/recommendation.repository';

/**
 * Endpoint público para leer la última recomendación persistida del IA
 * para una submission. Permite al frontend mostrar "lo que dijo el IA
 * cuando se procesó la submission originalmente", a diferencia del
 * playground manual que ejecuta un nuevo análisis con el motor actual.
 *
 * Lectura abierta a STUDENT/PROFESSOR/ADMIN — el guard `SubmissionsService`
 * ya filtra qué submissions son visibles por rol al obtener el id desde
 * GET /submissions/:id. Si llega un id de submission que el caller no
 * debería ver, simplemente no encontrará Recommendation (404).
 */
@ApiTags('submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('submissions/:submissionId/recommendation')
export class SubmissionRecommendationController {
  constructor(
    @Inject(RECOMMENDATION_REPOSITORY)
    private readonly repo: RecommendationRepository,
  ) {}

  @Get()
  @Roles(Role.STUDENT, Role.PROFESSOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener la última recomendación IA persistida para una submission',
    description:
      'Devuelve la Recommendation guardada por el worker tras procesar la submission. ' +
      '404 si la submission no tiene análisis persistido (submissions antiguas previas al cableado).',
  })
  @ApiResponse({ status: 200, description: 'Recomendación encontrada' })
  @ApiResponse({
    status: 404,
    description: 'No hay recomendación persistida para esta submission',
  })
  async getBySubmission(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ) {
    const rec = await this.repo.findLatestBySubmission(submissionId);
    if (!rec) {
      throw new NotFoundException(
        'No hay análisis IA persistido para esta submission. ' +
          'Puede ser una submission antigua o el worker no la guardó. ' +
          'Generá un nuevo análisis desde el playground si querés evaluarla.',
      );
    }
    return rec;
  }
}
