import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/infrastructure/decorators/current-user.decorator';
import { TestDataService } from '../application/test-data.service';
import {
  CreateManualDatasetDto,
  GenerateDatasetDto,
} from '../application/dto/test-data.dto';

@ApiTags('test-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('challenges/:challengeId/test-data')
export class TestDataController {
  constructor(private readonly service: TestDataService) {}

  @Get()
  @ApiOperation({ summary: 'Listar datasets del reto' })
  list(@Param('challengeId', new ParseUUIDPipe()) challengeId: string) {
    return this.service.listForChallenge(challengeId);
  }

  @Post('manual')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Cargar dataset manual (script INSERT)' })
  createManual(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: CreateManualDatasetDto,
  ) {
    return this.service.createManual(challengeId, u.id, dto);
  }

  @Post('generate')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Generar dataset a partir de configuración' })
  generate(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: GenerateDatasetDto,
  ) {
    return this.service.generate(challengeId, u.id, dto);
  }

  @Post('preview')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Previsualizar el SQL generado sin guardarlo' })
  preview(@Body() dto: GenerateDatasetDto) {
    return this.service.preview(dto);
  }
}
