import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TestDatasetKind } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  CreateManualDatasetDto,
  GenerateDatasetDto,
} from './dto/test-data.dto';
import { DataGeneratorService } from './data-generator.service';

@Injectable()
export class TestDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: DataGeneratorService,
  ) {}

  async listForChallenge(challengeId: string) {
    return this.prisma.testDataset.findMany({
      where: { challengeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createManual(challengeId: string, professorId: string, dto: CreateManualDatasetDto) {
    await this.assertOwnership(challengeId, professorId);
    return this.prisma.testDataset.create({
      data: {
        challengeId,
        name: dto.name,
        kind: TestDatasetKind.MANUAL_INSERT,
        sql: dto.sql,
      },
    });
  }

  async generate(challengeId: string, professorId: string, dto: GenerateDatasetDto) {
    await this.assertOwnership(challengeId, professorId);
    const { sql } = this.generator.generate(dto.tables);
    return this.prisma.testDataset.create({
      data: {
        challengeId,
        name: dto.name,
        kind: TestDatasetKind.GENERATOR_CONFIG,
        sql,
        generatorConfig: dto as any,
      },
    });
  }

  /**
   * Endpoint útil de "preview" para que el profesor vea el SQL antes de guardarlo.
   */
  preview(dto: GenerateDatasetDto) {
    return this.generator.generate(dto.tables);
  }

  private async assertOwnership(challengeId: string, professorId: string) {
    const c = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!c) throw new NotFoundException('Reto no encontrado');
    if (c.createdById !== professorId) {
      throw new ForbiddenException('Solo el autor del reto puede modificar sus datasets');
    }
  }
}
