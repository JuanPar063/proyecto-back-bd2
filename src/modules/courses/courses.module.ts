import { Module } from '@nestjs/common';
import { CoursesController } from './presentation/courses.controller';
import { CoursesService } from './application/courses.service';

/**
 * MÓDULO REDELEGADO -> SOFIA PALACIO
 * Encaja con su trabajo de auth/users porque la inscripción de
 * estudiantes vive aquí (PROFESSOR inscribe STUDENT).
 *
 * Stub funcional: lista los cursos del profesor autenticado.
 * Tareas pendientes para Sofia (marcadas con TODO en los archivos):
 *  - CRUD completo
 *  - Inscripción / desinscripción de estudiantes
 *  - Filtro de listado para STUDENT (solo cursos donde está inscrito)
 *  - Pruebas Postman
 */
@Module({
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
