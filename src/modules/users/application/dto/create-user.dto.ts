import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'profesor@univ.edu' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P4ssw0rd!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Sofia Palacio' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ enum: Role, example: Role.PROFESSOR })
  @IsEnum(Role)
  role!: Role;
}
