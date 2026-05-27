import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Loan } from './entities/loan.entity';
import { LoanBorrower } from './entities/loan-borrower.entity';
import { Disbursement } from '../disbursements/entities/disbursement.entity';
import { ScheduleItem } from '../schedule/entities/schedule-item.entity';
import { LoanModification } from './entities/loan-modification.entity';
import { AuditService } from '../../common/audit.service';
import { ScheduleService } from '../schedule/schedule.service';
import { InterestAccrualService } from '../interest/interest-accrual.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { ModifyLoanDto } from './dto/modify-loan.dto';
import { RequestContext } from '../../common/interfaces/request-context.interface';

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    @InjectRepository(Loan)
    private readonly loanRepo: Repository<Loan>,
    @InjectRepository(LoanBorrower)
    private readonly loanBorrowerRepo: Repository<LoanBorrower>,
    @InjectRepository(Disbursement)
    private readonly disbursementRepo: Repository<Disbursement>,
    @InjectRepository(ScheduleItem)
    private readonly scheduleRepo: Repository<ScheduleItem>,
    @InjectRepository(LoanModification)
    private readonly modificationRepo: Repository<LoanModification>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly scheduleService: ScheduleService,
    private readonly accrualService: InterestAccrualService,
  ) {}

  // ─── Create Loan ──────────────────────────────────────────────────────────────

  async createLoan(dto: CreateLoanDto, ctx: RequestContext): Promise<Loan> {
    await this.setTenantContext(ctx.tenantId);

    return this.dataSource.transaction(async (manager) => {
      // Validate interest type fields
      this.validateInterestConfig(dto);

      // Compute maturity date if only term is provided
      const maturityDate = dto.maturityDate
        ? new Date(dto.maturityDate)
        : this.computeMaturityDate(new Date(dto.originationDate), dto.loanTermMonths!);

      // Generate loan number
      const loanNumber = await this.generateLoanNumber(ctx.tenantId, manager);

      const loan = manager.create(Loan, {
        ...dto,
        tenantId: ctx.tenantId,
        loanNumber,
        maturityDate,
        status: 'PENDING',
        outstandingBalance: 0,
        accruedInterest: 0,
        daysPastDue: 0,
        createdBy: ctx.userId,
      });

      const saved = await manager.save(loan);

      // Link borrowers
      if (dto.borrowers?.length) {
        const loanBorrowers = dto.borrowers.map((b) =>
          manager.create(LoanBorrower, {
            tenantId: ctx.tenantId,
            loanId: saved.id,
            borrowerId: b.borrowerId,
            role: b.role ?? 'PRIMARY',
            ownershipPct: b.ownershipPct,
          }),
        );
        await manager.save(loanBorrowers);
      }

      await this.auditService.log({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'LOAN_CREATED',
        entityType: 'LOAN',
        entityId: saved.id,
        newState: saved,
        ipAddress: ctx.ipAddress,
      });

      this.logger.log({ msg: 'Loan created', loanId: saved.id, tenantId: ctx.tenantId });
      return saved;
    });
  }

  // ─── Get Loan ────────────────────────────────────────────────────────────────

  async getLoan(loanId: string, ctx: RequestContext): Promise<Loan> {
    await this.setTenantContext(ctx.tenantId);

    const loan = await this.loanRepo.findOne({
      where: { id: loanId, tenantId: ctx.tenantId },
      relations: [
        'loanBorrowers',
        'loanBorrowers.borrower',
        'disbursements',
        'fees',
        'scheduleItems',
      ],
    });

    if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);
    return loan;
  }

  // ─── List Loans ───────────────────────────────────────────────────────────────

  async listLoans(
    ctx: RequestContext,
    filters: {
      status?: string[];
      fromDate?: string;
      toDate?: string;
      borrowerId?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    await this.setTenantContext(ctx.tenantId);

    const { page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const qb = this.loanRepo
      .createQueryBuilder('l')
      .where('l.tenant_id = :tenantId', { tenantId: ctx.tenantId });

    if (filters.status?.length) {
      qb.andWhere('l.status IN (:...statuses)', { statuses: filters.status });
    }
    if (filters.fromDate) {
      qb.andWhere('l.origination_date >= :fromDate', { fromDate: filters.fromDate });
    }
    if (filters.toDate) {
      qb.andWhere('l.origination_date <= :toDate', { toDate: filters.toDate });
    }
    if (filters.borrowerId) {
      qb.innerJoin('l.loanBorrowers', 'lb', 'lb.borrower_id = :borrowerId', {
        borrowerId: filters.borrowerId,
      });
    }
    if (filters.search) {
      qb.andWhere('l.loan_number ILIKE :search', { search: `%${filters.search}%` });
    }

    const [items, total] = await qb
      .orderBy('l.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Modify Loan (rate/term change) ──────────────────────────────────────────

  async modifyLoan(loanId: string, dto: ModifyLoanDto, ctx: RequestContext): Promise<Loan> {
    this.assertRole(ctx.role, ['ADMIN', 'OPERATOR']);
    await this.setTenantContext(ctx.tenantId);

    return this.dataSource.transaction(async (manager) => {
      const loan = await manager.findOne(Loan, {
        where: { id: loanId, tenantId: ctx.tenantId },
      });
      if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);
      if (!['ACTIVE', 'CURRENT', 'DELINQUENT'].includes(loan.status)) {
        throw new BadRequestException(`Cannot modify loan in status ${loan.status}`);
      }

      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};

      // Apply rate change
      if (dto.fixedRate !== undefined && loan.interestType === 'FIXED') {
        previousValues.fixedRate = loan.fixedRate;
        newValues.fixedRate = dto.fixedRate;
        loan.fixedRate = dto.fixedRate;
      }
      if (dto.marginRate !== undefined && loan.interestType === 'FLOATING') {
        previousValues.marginRate = loan.marginRate;
        newValues.marginRate = dto.marginRate;
        loan.marginRate = dto.marginRate;
      }

      // Apply term change
      if (dto.newMaturityDate) {
        previousValues.maturityDate = loan.maturityDate;
        newValues.maturityDate = dto.newMaturityDate;
        loan.maturityDate = new Date(dto.newMaturityDate);
        loan.loanTermMonths = this.monthsBetween(
          new Date(loan.originationDate),
          loan.maturityDate,
        );
      }

      if (!Object.keys(newValues).length) {
        throw new BadRequestException('No modification fields provided');
      }

      await manager.save(loan);

      // Record modification history
      await manager.save(
        manager.create(LoanModification, {
          tenantId: ctx.tenantId,
          loanId: loan.id,
          modificationType: dto.modificationType ?? 'GENERAL',
          effectiveDate: new Date(dto.effectiveDate),
          previousValues,
          newValues,
          reason: dto.reason,
          createdBy: ctx.userId,
        }),
      );

      // Regenerate repayment schedule
      await this.scheduleService.generateSchedule(loan, ctx.tenantId);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'LOAN_MODIFIED',
        entityType: 'LOAN',
        entityId: loanId,
        previousState: previousValues,
        newState: newValues,
        ipAddress: ctx.ipAddress,
      });

      this.logger.log({ msg: 'Loan modified', loanId, tenantId: ctx.tenantId, changes: newValues });
      return loan;
    });
  }

  // ─── Activate Loan (after first disbursement) ─────────────────────────────────

  async activateLoan(loanId: string, ctx: RequestContext): Promise<Loan> {
    this.assertRole(ctx.role, ['ADMIN', 'OPERATOR']);
    await this.setTenantContext(ctx.tenantId);

    return this.dataSource.transaction(async (manager) => {
      const loan = await manager.findOne(Loan, {
        where: { id: loanId, tenantId: ctx.tenantId },
        relations: ['disbursements'],
      });
      if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);
      if (loan.status !== 'PENDING') {
        throw new BadRequestException(`Loan is already ${loan.status}`);
      }

      const disbursed = loan.disbursements?.filter((d) => d.status === 'DISBURSED') ?? [];
      if (!disbursed.length) {
        throw new BadRequestException('Cannot activate loan without at least one disbursement');
      }

      const totalDisbursed = disbursed.reduce((s, d) => s + Number(d.amount), 0);
      loan.outstandingBalance = totalDisbursed;
      loan.status = 'ACTIVE';
      loan.lastAccrualDate = new Date(loan.originationDate);

      await manager.save(loan);

      // Generate initial repayment schedule
      await this.scheduleService.generateSchedule(loan, ctx.tenantId);

      return loan;
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private validateInterestConfig(dto: CreateLoanDto): void {
    if (dto.interestType === 'FIXED' && dto.fixedRate == null) {
      throw new BadRequestException('fixed_rate is required for FIXED interest type');
    }
    if (dto.interestType === 'FLOATING') {
      if (!dto.indexRateName || dto.marginRate == null) {
        throw new BadRequestException(
          'index_rate_name and margin_rate are required for FLOATING interest type',
        );
      }
    }
    if (!dto.maturityDate && !dto.loanTermMonths) {
      throw new BadRequestException('Either maturity_date or loan_term_months must be provided');
    }
  }

  private computeMaturityDate(originationDate: Date, termMonths: number): Date {
    const d = new Date(originationDate);
    d.setMonth(d.getMonth() + termMonths);
    return d;
  }

  private monthsBetween(from: Date, to: Date): number {
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  }

  private async generateLoanNumber(tenantId: string, manager: any): Promise<string> {
    const result = await manager.query(
      `SELECT COUNT(*) as count FROM loans WHERE tenant_id = $1`,
      [tenantId],
    );
    const seq = parseInt(result[0].count) + 1;
    const year = new Date().getFullYear();
    return `LN-${year}-${String(seq).padStart(5, '0')}`;
  }

  private async setTenantContext(tenantId: string): Promise<void> {
    await this.dataSource.query(`SET app.current_tenant_id = '${tenantId}'`);
  }

  private assertRole(role: string, allowed: string[]): void {
    if (!allowed.includes(role)) {
      throw new ForbiddenException(`Role ${role} cannot perform this action`);
    }
  }
}
