import { Injectable } from '@nestjs/common';
import { Prisma, RuleSeverity } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type {
  AiQualityScore,
  RuleWarning,
} from '../../../shared/contracts';
import { Recommendation } from '../domain/recommendation.entity';
import type { RecommendationRepository } from '../domain/recommendation.repository';

type PrismaRecommendation = Prisma.RecommendationGetPayload<Record<string, never>>;

/**
 * Adapter Prisma para RecommendationRepository.
 *
 * Si al compilar ves errores sobre `Prisma.Recommendation*`, es porque
 * el cliente Prisma aún no se ha regenerado tras agregar el modelo. Corre:
 *
 *     npx prisma generate
 *
 * Y para crear la migración en la DB:
 *
 *     npx prisma migrate dev --name add_recommendations
 */
@Injectable()
export class PrismaRecommendationRepository implements RecommendationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(rec: Recommendation): Promise<Recommendation> {
    const row = await this.prisma.recommendation.create({
      data: {
        submissionId: rec.submissionId,
        explanation: rec.explanation,
        suggestedIndexes: rec.suggestedIndexes,
        rewriteSql: rec.rewriteSql,
        warnings: rec.warnings as unknown as Prisma.InputJsonValue,
        impact: rec.impact,
        highestSeverity: this.highestSeverityOf(rec.warnings),
        qualityScore: rec.qualityScore
          ? (rec.qualityScore as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    return this.toDomain(row);
  }

  async findLatestBySubmission(submissionId: string): Promise<Recommendation | null> {
    const row = await this.prisma.recommendation.findFirst({
      where: { submissionId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  async listBySubmission(submissionId: string): Promise<Recommendation[]> {
    const rows = await this.prisma.recommendation.findMany({
      where: { submissionId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  private highestSeverityOf(warnings: RuleWarning[]): RuleSeverity {
    if (warnings.some((w) => w.severity === 'critical')) return RuleSeverity.critical;
    if (warnings.some((w) => w.severity === 'warning')) return RuleSeverity.warning;
    return RuleSeverity.info;
  }

  private toDomain(row: PrismaRecommendation): Recommendation {
    return new Recommendation({
      id: row.id,
      submissionId: row.submissionId,
      explanation: row.explanation,
      suggestedIndexes: row.suggestedIndexes,
      rewriteSql: row.rewriteSql,
      warnings: (row.warnings as unknown as RuleWarning[]) ?? [],
      impact: row.impact,
      qualityScore: (row.qualityScore as unknown as AiQualityScore | null) ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
