import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'estudiante@univ.edu' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P4ssw0rd!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Juan Pardo' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  /**
   * Por seguridad, el endpoint público /auth/register solo permite STUDENT.
   * ADMIN y PROFESSOR se crean desde /users por un ADMIN autenticado.
   */
  @ApiPropertyOptional({ enum: [Role.STUDENT], default: Role.STUDENT })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}
