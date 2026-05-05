import { Role } from '@prisma/client';
import { BaseEntity } from '../../../shared/domain/base.entity';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class User extends BaseEntity {
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  isActive: boolean;

  constructor(props: UserProps) {
    super(props);
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.fullName = props.fullName;
    this.role = props.role;
    this.isActive = props.isActive;
  }

  isAdmin(): boolean {
    return this.role === Role.ADMIN;
  }

  isProfessor(): boolean {
    return this.role === Role.PROFESSOR;
  }

  isStudent(): boolean {
    return this.role === Role.STUDENT;
  }

  deactivate(): void {
    this.isActive = false;
  }
}
