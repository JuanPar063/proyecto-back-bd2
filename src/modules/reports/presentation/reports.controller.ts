import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from '../application/reports.service';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('students/:id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @ApiOperation({ summary: 'Get academic report for a student' })
  getStudentReport(@Param('id') id: string) {
    return this.reportsService.getStudentReport(id);
  }

  @Get('challenges/:id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @ApiOperation({ summary: 'Get performance report for a challenge' })
  getChallengeReport(@Param('id') id: string) {
    return this.reportsService.getChallengeReport(id);
  }

  @Get('courses/:id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @ApiOperation({ summary: 'Get academic report for a course' })
  getCourseReport(@Param('id') id: string) {
    return this.reportsService.getCourseReport(id);
  }

  @Get('leaderboard')
  @Roles(Role.ADMIN, Role.PROFESSOR, Role.STUDENT)
  @ApiOperation({ summary: 'Get leaderboard by course or evaluation' })
  getLeaderboard(
    @Query('courseId') courseId?: string,
    @Query('evaluationId') evaluationId?: string,
  ) {
    return this.reportsService.getLeaderboard({ courseId, evaluationId });
  }
}