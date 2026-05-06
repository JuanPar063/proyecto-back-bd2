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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/infrastructure/decorators/current-user.decorator';
import { ChallengesService } from '../application/challenges.service';
import {
  ChangeStatusDto,
  CreateChallengeDto,
  UpdateChallengeDto,
} from '../application/dto/challenge.dto';

@ApiTags('challenges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Post()
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Crear reto SQL en un curso (PROFESSOR)' })
  create(@CurrentUser() u: CurrentUserPayload, @Body() dto: CreateChallengeDto) {
    return this.challenges.create(u.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar retos visibles según rol' })
  @ApiQuery({ name: 'courseId', required: false })
  list(@CurrentUser() u: CurrentUserPayload, @Query('courseId') courseId?: string) {
    return this.challenges.listForUser(u.id, u.role, courseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de reto' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: CurrentUserPayload,
  ) {
    return this.challenges.findOne(id, u.id, u.role);
  }

  @Patch(':id')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Editar reto (solo autor)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: UpdateChallengeDto,
  ) {
    return this.challenges.update(id, u.id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Transicionar estado (draft/published/archived)' })
  changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.challenges.changeStatus(id, u.id, dto);
  }
}
