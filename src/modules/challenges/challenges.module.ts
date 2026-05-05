import { Module } from '@nestjs/common';
import { ChallengesController } from './presentation/challenges.controller';
import { ChallengesService } from './application/challenges.service';

/**
 * MÓDULO REDELEGADO -> RUIZ AKLE, JUAN
 * Encaja con su trabajo porque SchemaScript y TestDataset cuelgan de
 * Challenge: tener este módulo bajo su control le da el flujo completo
 * profesor -> reto -> esquema -> datos.
 *
 * Stub funcional incluido. Tareas pendientes para Ruiz (TODO en código):
 *  - Validar que solo el profesor del curso pueda crear retos en él
 *  - Reglas de transición de estado (draft -> published -> archived)
 *  - Bloquear archive si hay submissions activas
 *  - Filtrar retos para STUDENT (solo published de cursos donde está inscrito)
 *  - Pruebas Postman
 */
@Module({
  controllers: [ChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
