import { Injectable } from '@nestjs/common';
import { User as PrismaUser } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { User } from '../domain/user.entity';
import { UserRepository } from '../domain/user.repository';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(row: PrismaUser): User {
    return new User({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      fullName: row.fullName,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async list(opts: { skip: number; take: number }) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip: opts.skip,
        take: opts.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return { data: rows.map((r) => this.toDomain(r)), total };
  }

  async create(user: User): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      },
    });
    return this.toDomain(row);
  }

  async update(user: User): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      },
    });
    return this.toDomain(row);
  }
}
