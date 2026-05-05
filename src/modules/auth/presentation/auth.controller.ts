import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuthService } from '../application/auth.service';
import { LoginDto, RegisterDto } from '../application/dto/register.dto';
import { JwtAuthGuard } from '../infrastructure/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../infrastructure/decorators/current-user.decorator';

class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registro de estudiante' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login con email + contraseña' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar access token usando refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Información del usuario autenticado' })
  me(@CurrentUser() user: CurrentUserPayload) {
    return user;
  }
}
