import { User } from './user.entity';

/**
 * Puerto del dominio de usuarios. La implementación con Prisma vive en
 * `infrastructure/prisma-user.repository.ts`. Esto mantiene la regla
 * de Clean Architecture: el dominio no conoce la persistencia.
 */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(opts: { skip: number; take: number }): Promise<{ data: User[]; total: number }>;
  create(user: User): Promise<User>;
  update(user: User): Promise<User>;
}
