import { Module } from '@nestjs/common';
import { SchemasModule } from '../schemas/schemas.module';
import { TestDataModule } from '../test-data/test-data.module';
import { DemoController } from './presentation/demo.controller';
import { DemoService } from './application/demo.service';

/**
 * MÓDULO DEMO — RUIZ AKLE, JUAN
 *
 * Compone los módulos schemas + test-data para crear un escenario
 * end-to-end (curso + reto + esquema + dataset) en una sola llamada.
 * No introduce nuevas reglas de dominio; solo orquesta servicios existentes.
 */
@Module({
  imports: [SchemasModule, TestDataModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
