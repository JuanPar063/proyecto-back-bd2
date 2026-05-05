import { Module } from '@nestjs/common';
import { TestDataController } from './presentation/test-data.controller';
import { TestDataService } from './application/test-data.service';
import { DataGeneratorService } from './application/data-generator.service';

@Module({
  controllers: [TestDataController],
  providers: [TestDataService, DataGeneratorService],
  exports: [TestDataService, DataGeneratorService],
})
export class TestDataModule {}
