/**
 * Excepción base del dominio. Las capas de aplicación/presentación deben
 * traducirla a HttpExceptions adecuados (ver convenciones).
 */
export class DomainException extends Error {
  readonly code: string;

  constructor(message: string, code = 'DOMAIN_ERROR') {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
}

export class NotFoundDomainException extends DomainException {
  constructor(entity: string, id: string) {
    super(`${entity} con id ${id} no encontrado`, 'NOT_FOUND');
  }
}

export class ForbiddenDomainException extends DomainException {
  constructor(message: string) {
    super(message, 'FORBIDDEN');
  }
}

export class InvariantViolation extends DomainException {
  constructor(message: string) {
    super(message, 'INVARIANT_VIOLATION');
  }
}
