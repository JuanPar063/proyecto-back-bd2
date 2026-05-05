import { Module } from '@nestjs/common';
import { SchemasController } from './presentation/schemas.controller';
import { SchemasService } from './application/schemas.service';

@Module({
  controllers: [SchemasController],
  providers: [SchemasService],
  exports: [SchemasService],
})
export class SchemasModule {}
