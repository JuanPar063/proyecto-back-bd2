import { Module } from '@nestjs/common';
import { ReportsController } from './presentation/reports.controller';
import { ReportsService } from './application/reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}