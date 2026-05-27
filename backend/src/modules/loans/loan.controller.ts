import {
  Controller, Get, Post, Put, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse,
  ApiQuery, ApiParam,
} from '@nestjs/swagger';
import { LoanService } from './loan.service';
import { DisbursementService } from '../disbursements/disbursement.service';
import { PaymentService } from '../payments/payment.service';
import { ScheduleService } from '../schedule/schedule.service';
import { FeeService } from '../fees/fee.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { ModifyLoanDto } from './dto/modify-loan.dto';
import { CreateDisbursementDto } from '../disbursements/dto/create-disbursement.dto';
import { CreatePaymentDto } from '../payments/dto/create-payment.dto';
import { CreateFeeDto } from '../fees/dto/create-fee.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';
import { ResponseTimeInterceptor } from '../../common/interceptors/response-time.interceptor';
import { RequestContext } from '../../common/interfaces/request-context.interface';

@ApiTags('Loans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(AuditInterceptor, ResponseTimeInterceptor)
@Controller('api/v1/loans')
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly disbursementService: DisbursementService,
    private readonly paymentService: PaymentService,
    private readonly scheduleService: ScheduleService,
    private readonly feeService: FeeService,
  ) {}

  // ─── LOANS ───────────────────────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new loan' })
  @ApiResponse({ status: 201, description: 'Loan created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createLoan(@Body() dto: CreateLoanDto, @CurrentUser() ctx: RequestContext) {
    return this.loanService.createLoan(dto, ctx);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  @ApiOperation({ summary: 'List loans with filters' })
  @ApiQuery({ name: 'status', required: false, isArray: true })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  @ApiQuery({ name: 'borrowerId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listLoans(
    @Query('status') status: string | string[],
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Query('borrowerId') borrowerId: string,
    @Query('search') search: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser() ctx: RequestContext,
  ) {
    const statuses = status ? (Array.isArray(status) ? status : [status]) : undefined;
    return this.loanService.listLoans(ctx, { status: statuses, fromDate, toDate, borrowerId, search, page: +page, limit: +limit });
  }

  @Get(':loanId')
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  @ApiParam({ name: 'loanId', type: String })
  @ApiOperation({ summary: 'Get loan details' })
  async getLoan(@Param('loanId', ParseUUIDPipe) loanId: string, @CurrentUser() ctx: RequestContext) {
    return this.loanService.getLoan(loanId, ctx);
  }

  @Put(':loanId')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Update loan (non-financial fields)' })
  async updateLoan(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: UpdateLoanDto,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.loanService.updateLoan(loanId, dto, ctx);
  }

  @Post(':loanId/activate')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate loan (post first disbursement)' })
  async activateLoan(@Param('loanId', ParseUUIDPipe) loanId: string, @CurrentUser() ctx: RequestContext) {
    return this.loanService.activateLoan(loanId, ctx);
  }

  @Post(':loanId/modify')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modify loan terms (rate/maturity change)' })
  @ApiResponse({ status: 200, description: 'Loan modified and schedule regenerated' })
  async modifyLoan(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: ModifyLoanDto,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.loanService.modifyLoan(loanId, dto, ctx);
  }

  // ─── DISBURSEMENTS ───────────────────────────────────────────────────────────

  @Post(':loanId/disbursements')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create disbursement' })
  async createDisbursement(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: CreateDisbursementDto,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.disbursementService.createDisbursement(loanId, dto, ctx);
  }

  @Get(':loanId/disbursements')
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  @ApiOperation({ summary: 'List disbursements for a loan' })
  async getDisbursements(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.disbursementService.getDisbursements(loanId, ctx);
  }

  @Post(':loanId/disbursements/:disbursementId/approve')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a disbursement (ADMIN only)' })
  async approveDisbursement(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Param('disbursementId', ParseUUIDPipe) disbursementId: string,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.disbursementService.approveDisbursement(disbursementId, ctx);
  }

  // ─── PAYMENTS ────────────────────────────────────────────────────────────────

  @Post(':loanId/payments')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply a payment with manual allocation' })
  async applyPayment(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.paymentService.applyPayment(loanId, dto, ctx);
  }

  @Get(':loanId/payments')
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  @ApiOperation({ summary: 'Get payment history' })
  async getPayments(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.paymentService.getPaymentHistory(loanId, ctx, +page, +limit);
  }

  @Post(':loanId/payments/preview')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview payment allocation (dry-run)' })
  async previewPayment(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body('paymentAmount') paymentAmount: number,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.paymentService.previewAllocation(loanId, paymentAmount, ctx);
  }

  @Post(':loanId/payments/:paymentId/reverse')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a payment (ADMIN only)' })
  async reversePayment(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body('reason') reason: string,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.paymentService.reversePayment(paymentId, reason, ctx);
  }

  // ─── SCHEDULE ────────────────────────────────────────────────────────────────

  @Get(':loanId/schedule')
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  @ApiOperation({ summary: 'Get repayment schedule' })
  async getSchedule(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.scheduleService.getSchedule(loanId, ctx.tenantId);
  }

  // ─── FEES ────────────────────────────────────────────────────────────────────

  @Post(':loanId/fees')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a fee to a loan' })
  async addFee(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: CreateFeeDto,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.feeService.addFee(loanId, dto, ctx);
  }

  @Get(':loanId/fees')
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  @ApiOperation({ summary: 'List fees for a loan' })
  async getFees(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.feeService.getFees(loanId, ctx.tenantId);
  }

  @Post(':loanId/fees/:feeId/waive')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Waive a fee (ADMIN only)' })
  async waiveFee(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Param('feeId', ParseUUIDPipe) feeId: string,
    @Body('reason') reason: string,
    @CurrentUser() ctx: RequestContext,
  ) {
    return this.feeService.waiveFee(feeId, reason, ctx);
  }
}
