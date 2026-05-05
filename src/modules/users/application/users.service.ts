import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from '../domain/user.entity';
import { USER_REPOSITORY, UserRepository } from '../domain/user.repository';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = new User({
      id: randomUUID(),
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.users.create(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.findByEmail(email);
  }

  async list(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { data, total } = await this.users.list({ skip, take: limit });
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deactivate(id: string): Promise<User> {
    const user = await this.findById(id);
    user.deactivate();
    return this.users.update(user);
  }
}
