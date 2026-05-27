import { Controller, Get, Post, Query, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';

@ApiTags('Reports')
@ApiBearerAuth('cognito-jwt')
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportService) {}

  @Get('active-loans')
  @ApiOperation({ summary: 'Active loans portfolio summary' })
  activeLoansSummary(@CurrentUser() user: JwtPayload) {
    return this.svc.getActiveLoansReport(user.tenantId);
  }

  @Get('delinquency')
  @ApiOperation({ summary: 'Delinquency bucket report' })
  delinquency(@CurrentUser() user: JwtPayload) {
    return this.svc.getDelinquencyReport(user.tenantId);
  }

  @Get('amount-due')
  @ApiOperation({ summary: 'Scheduled vs paid by date range' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  amountDue(
    @CurrentUser() user: JwtPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.getAmountDueReport(user.tenantId, from, to);
  }

  @Post('snowflake-export')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Trigger Snowflake S3 export (ADMIN only)' })
  @ApiQuery({ name: 'type', required: false })
  snowflakeExport(
    @CurrentUser() user: JwtPayload,
    @Query('type') type?: string,
  ) {
    return this.svc.exportToSnowflake(user.tenantId, type);
  }
}
