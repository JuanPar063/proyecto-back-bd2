import { Recommendation } from './recommendation.entity';

/**
 * Puerto de persistencia para recomendaciones del asistente IA.
 * La implementación con Prisma vive en infrastructure/.
 */
export const RECOMMENDATION_REPOSITORY = Symbol('RECOMMENDATION_REPOSITORY');

export interface RecommendationRepository {
  /** Persiste una recomendación nueva. Devuelve la entidad con su id real. */
  save(rec: Recommendation): Promise<Recommendation>;
  /** Última recomendación generada para una submission, o null si no hay. */
  findLatestBySubmission(submissionId: string): Promise<Recommendation | null>;
  /** Historial completo para auditoría / reportes. */
  listBySubmission(submissionId: string): Promise<Recommendation[]>;
}
