import { Module } from '@nestjs/common';
import { EvaluationsService } from './application/evaluations.service';
import { EvaluationsController } from './presentation/evaluations.controller';

@Module({
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
