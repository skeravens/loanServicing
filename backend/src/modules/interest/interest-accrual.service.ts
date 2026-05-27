import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Loan } from '../loans/entities/loan.entity';
import { InterestAccrual } from './entities/interest-accrual.entity';
import { IndexRateHistory } from './entities/index-rate-history.entity';
import { AuditService } from '../common/audit.service';

export interface AccrualResult {
  loanId: string;
  accrualDate: Date;
  principalBalance: number;
  dailyRate: number;
  accrualAmount: number;
  effectiveRate: number;
}

/**
 * Interest Accrual Engine
 *
 * Implements Actual/360 day count convention:
 *   Daily Interest = (Outstanding Balance × Annual Rate) / 360
 *
 * Runs nightly via EventBridge-triggered Lambda or scheduled cron.
 * Processes all ACTIVE loans within each tenant.
 */
@Injectable()
export class InterestAccrualService {
  private readonly logger = new Logger(InterestAccrualService.name);

  constructor(
    @InjectRepository(Loan)
    private readonly loanRepo: Repository<Loan>,
    @InjectRepository(InterestAccrual)
    private readonly accrualRepo: Repository<InterestAccrual>,
    @InjectRepository(IndexRateHistory)
    private readonly indexRateRepo: Repository<IndexRateHistory>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  // ─── Nightly Job (also triggered by EventBridge) ─────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runNightlyAccrual(): Promise<void> {
    const accrualDate = new Date();
    accrualDate.setHours(0, 0, 0, 0);
    this.logger.log(`Starting nightly accrual for date: ${accrualDate.toISOString().split('T')[0]}`);

    const tenants = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM tenants WHERE status = 'ACTIVE'`,
    );

    let totalProcessed = 0;
    let totalErrors = 0;

    for (const tenant of tenants) {
      try {
        const count = await this.runAccrualForTenant(tenant.id, accrualDate);
        totalProcessed += count;
        this.logger.log({ tenantId: tenant.id, loansProcessed: count, date: accrualDate });
      } catch (err) {
        totalErrors++;
        this.logger.error({ msg: 'Accrual failed for tenant', tenantId: tenant.id, error: err.message });
      }
    }

    this.logger.log({
      msg: 'Nightly accrual complete',
      totalProcessed,
      totalErrors,
      date: accrualDate,
    });
  }

  // ─── Per-tenant accrual ───────────────────────────────────────────────────────

  async runAccrualForTenant(tenantId: string, accrualDate: Date): Promise<number> {
    await this.dataSource.query(`SET app.current_tenant_id = '${tenantId}'`);

    const activeLoans = await this.loanRepo.find({
      where: { tenantId, status: 'ACTIVE' },
      relations: ['disbursements'],
    });

    let processed = 0;

    for (const loan of activeLoans) {
      try {
        await this.accrueInterestForLoan(loan, accrualDate, tenantId);
        processed++;
      } catch (err) {
        this.logger.error({
          msg: 'Failed to accrue for loan',
          loanId: loan.id,
          tenantId,
          error: err.message,
        });
      }
    }

    return processed;
  }

  // ─── Single loan accrual ─────────────────────────────────────────────────────

  async accrueInterestForLoan(
    loan: Loan,
    accrualDate: Date,
    tenantId: string,
  ): Promise<AccrualResult> {
    // Idempotency: skip if already accrued for this date
    const existing = await this.accrualRepo.findOne({
      where: { loanId: loan.id, accrualDate },
    });
    if (existing) {
      this.logger.debug({ msg: 'Accrual already exists', loanId: loan.id, date: accrualDate });
      return null;
    }

    // Determine the disbursed principal balance (only disbursed amounts accrue)
    const principalBalance = await this.getDisbursedBalance(loan.id, accrualDate);
    if (principalBalance <= 0) return null;

    // Resolve effective annual rate
    const effectiveRate = await this.resolveEffectiveRate(loan, accrualDate, tenantId);

    // Actual/360 calculation
    const { dailyRate, accrualAmount } = this.calculateActual360(principalBalance, effectiveRate);

    // Persist accrual record
    const accrual = this.accrualRepo.create({
      tenantId,
      loanId: loan.id,
      accrualDate,
      principalBalance,
      dailyRate,
      accrualAmount,
      indexRate: loan.indexRate ?? null,
      marginRate: loan.marginRate ?? null,
      effectiveRate,
    });

    await this.accrualRepo.save(accrual);

    // Update loan's accrued interest balance
    await this.loanRepo.increment({ id: loan.id }, 'accruedInterest', accrualAmount);
    await this.loanRepo.update({ id: loan.id }, { lastAccrualDate: accrualDate });

    return { loanId: loan.id, accrualDate, principalBalance, dailyRate, accrualAmount, effectiveRate };
  }

  // ─── Actual/360 Calculation ───────────────────────────────────────────────────

  /**
   * Actual/360 convention:
   *   Daily Rate = Annual Rate / 360
   *   Interest   = Principal × Daily Rate × 1 (one day)
   *
   * Precision: 10 decimal places for daily rate, rounded to 4dp for amounts.
   */
  calculateActual360(
    principalBalance: number,
    annualRate: number,
  ): { dailyRate: number; accrualAmount: number } {
    const dailyRate = annualRate / 360;
    const accrualAmount = Math.round(principalBalance * dailyRate * 10000) / 10000;
    return { dailyRate, accrualAmount };
  }

  /**
   * Project total interest for a period (for schedule generation).
   * daysInPeriod = actual calendar days between payment dates.
   */
  calculatePeriodInterest(
    principalBalance: number,
    annualRate: number,
    daysInPeriod: number,
  ): number {
    return Math.round(principalBalance * (annualRate / 360) * daysInPeriod * 10000) / 10000;
  }

  // ─── Effective Rate Resolution ────────────────────────────────────────────────

  private async resolveEffectiveRate(
    loan: Loan,
    asOfDate: Date,
    tenantId: string,
  ): Promise<number> {
    if (loan.interestType === 'FIXED') {
      return loan.fixedRate;
    }

    // Floating: look up the most recent index rate ≤ accrualDate
    const indexRecord = await this.indexRateRepo
      .createQueryBuilder('irh')
      .where('irh.tenant_id = :tenantId', { tenantId })
      .andWhere('irh.index_name = :name', { name: loan.indexRateName })
      .andWhere('irh.effective_date <= :date', { date: asOfDate })
      .orderBy('irh.effective_date', 'DESC')
      .limit(1)
      .getOne();

    if (!indexRecord) {
      throw new Error(`No index rate found for ${loan.indexRateName} as of ${asOfDate.toISOString()}`);
    }

    // Update loan's cached index rate
    await this.loanRepo.update({ id: loan.id }, { indexRate: indexRecord.rate });

    return indexRecord.rate + (loan.marginRate ?? 0);
  }

  // ─── Disbursed Balance Calculation ───────────────────────────────────────────

  private async getDisbursedBalance(loanId: string, asOfDate: Date): Promise<number> {
    const result = await this.dataSource.query<{ balance: string }[]>(
      `SELECT COALESCE(SUM(amount), 0) AS balance
       FROM disbursements
       WHERE loan_id = $1
         AND status = 'DISBURSED'
         AND effective_date <= $2`,
      [loanId, asOfDate],
    );

    return parseFloat(result[0]?.balance ?? '0');
  }

  // ─── Backfill (for loan origination or corrections) ───────────────────────────

  async backfillAccruals(loanId: string, tenantId: string, fromDate: Date, toDate: Date): Promise<number> {
    await this.dataSource.query(`SET app.current_tenant_id = '${tenantId}'`);
    const loan = await this.loanRepo.findOne({ where: { id: loanId, tenantId } });
    if (!loan) throw new Error(`Loan ${loanId} not found`);

    let count = 0;
    const current = new Date(fromDate);

    while (current <= toDate) {
      const result = await this.accrueInterestForLoan(loan, new Date(current), tenantId);
      if (result) count++;
      current.setDate(current.getDate() + 1);
    }

    this.logger.log({ msg: 'Backfill complete', loanId, fromDate, toDate, daysProcessed: count });
    return count;
  }

  // ─── Reporting helpers ────────────────────────────────────────────────────────

  async getAccrualSummary(loanId: string, fromDate: Date, toDate: Date) {
    const accruals = await this.accrualRepo
      .createQueryBuilder('ia')
      .where('ia.loan_id = :loanId', { loanId })
      .andWhere('ia.accrual_date BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .orderBy('ia.accrual_date', 'ASC')
      .getMany();

    const total = accruals.reduce((sum, a) => sum + Number(a.accrualAmount), 0);

    return {
      loanId,
      fromDate,
      toDate,
      totalAccrued: Math.round(total * 10000) / 10000,
      dayCount: accruals.length,
      accruals,
    };
  }
}
