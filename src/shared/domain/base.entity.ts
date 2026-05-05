/**
 * Entidad base del dominio. Todas las entidades de dominio deben extender
 * de aquí para forzar identidad por id y timestamps consistentes.
 *
 * NOTA Clean Architecture: estas son entidades de DOMINIO (puras, sin
 * decoradores de infraestructura). El mapeo a Prisma se hace en la capa
 * `infrastructure/repositories/*`.
 */
export abstract class BaseEntity {
  readonly id: string;
  readonly createdAt: Date;
  updatedAt: Date;

  protected constructor(props: { id: string; createdAt: Date; updatedAt: Date }) {
    this.id = props.id;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  equals(other: BaseEntity): boolean {
    return this.id === other.id;
  }
}
