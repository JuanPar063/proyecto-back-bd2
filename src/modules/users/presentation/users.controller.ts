import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../shared/application/dto/pagination.dto';
import { CreateUserDto } from '../application/dto/create-user.dto';
import { UsersService } from '../application/users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear usuario (ADMIN)' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar usuarios (ADMIN)' })
  list(@Query() q: PaginationQueryDto) {
    return this.users.list(q.page, q.limit);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Detalle de usuario (ADMIN)' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.findById(id);
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desactivar usuario (ADMIN)' })
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.deactivate(id);
  }
}
