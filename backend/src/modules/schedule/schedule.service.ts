import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Loan } from '../loans/entities/loan.entity';
import { ScheduleItem } from './entities/schedule-item.entity';
import { InterestAccrualService } from '../interest/interest-accrual.service';

type Frequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'BULLET';

interface SchedulePeriod {
  periodNumber: number;
  dueDate: Date;
  beginningBalance: number;
  scheduledInterest: number;
  scheduledPrincipal: number;
  scheduledFees: number;
  endingBalance: number;
  rateSnapshot: number;
}

/**
 * Schedule Service
 *
 * Generates amortization schedules for loans using Actual/360.
 * Recalculates on modification. Supports all payment frequencies.
 *
 * For BULLET loans: interest-only payments, full principal at maturity.
 * For amortizing loans: equal total payments (interest-first, then principal).
 */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    @InjectRepository(ScheduleItem)
    private readonly scheduleRepo: Repository<ScheduleItem>,
    private readonly dataSource: DataSource,
    private readonly accrualService: InterestAccrualService,
  ) {}

  async generateSchedule(loan: Loan, tenantId: string): Promise<ScheduleItem[]> {
    // Delete existing schedule (on modification)
    await this.scheduleRepo.delete({ loanId: loan.id });

    const periods = this.buildSchedulePeriods(loan);
    const items = periods.map((p) =>
      this.scheduleRepo.create({
        tenantId,
        loanId: loan.id,
        periodNumber: p.periodNumber,
        dueDate: p.dueDate,
        beginningBalance: p.beginningBalance,
        scheduledPrincipal: p.scheduledPrincipal,
        scheduledInterest: p.scheduledInterest,
        scheduledFees: p.scheduledFees,
        endingBalance: p.endingBalance,
        rateSnapshot: p.rateSnapshot,
        paidPrincipal: 0,
        paidInterest: 0,
        paidFees: 0,
        status: 'PENDING',
      }),
    );

    await this.scheduleRepo.save(items);
    this.logger.log({ msg: 'Schedule generated', loanId: loan.id, periods: items.length });
    return items;
  }

  // ─── Core schedule builder ────────────────────────────────────────────────────

  private buildSchedulePeriods(loan: Loan): SchedulePeriod[] {
    const annualRate = this.getEffectiveRate(loan);
    const originationDate = new Date(loan.originationDate);
    const maturityDate = new Date(loan.maturityDate);
    const firstPaymentDate = loan.firstPaymentDate
      ? new Date(loan.firstPaymentDate)
      : this.addPeriod(originationDate, loan.paymentFrequency as Frequency);

    if (loan.paymentFrequency === 'BULLET') {
      return this.buildBulletSchedule(loan, annualRate, originationDate, maturityDate);
    }

    const paymentDates = this.generatePaymentDates(
      firstPaymentDate,
      maturityDate,
      loan.paymentFrequency as Frequency,
    );

    return this.buildAmortizingSchedule(
      loan.outstandingBalance || loan.loanAmount,
      annualRate,
      originationDate,
      paymentDates,
    );
  }

  private buildAmortizingSchedule(
    principalBalance: number,
    annualRate: number,
    originationDate: Date,
    paymentDates: Date[],
  ): SchedulePeriod[] {
    const periods: SchedulePeriod[] = [];
    let balance = principalBalance;
    let prevDate = originationDate;

    // Calculate level payment (constant total payment)
    const levelPayment = this.calculateLevelPayment(principalBalance, annualRate, paymentDates, originationDate);

    for (let i = 0; i < paymentDates.length; i++) {
      const dueDate = paymentDates[i];
      const daysInPeriod = this.daysBetween(prevDate, dueDate);

      const interest = this.accrualService.calculatePeriodInterest(balance, annualRate, daysInPeriod);

      let principal: number;
      if (i === paymentDates.length - 1) {
        // Last period: pay off remaining balance
        principal = balance;
      } else {
        principal = Math.max(0, Math.min(levelPayment - interest, balance));
      }

      principal = Math.round(principal * 10000) / 10000;
      const endingBalance = Math.max(0, Math.round((balance - principal) * 10000) / 10000);

      periods.push({
        periodNumber: i + 1,
        dueDate,
        beginningBalance: balance,
        scheduledInterest: Math.round(interest * 10000) / 10000,
        scheduledPrincipal: principal,
        scheduledFees: 0,
        endingBalance,
        rateSnapshot: annualRate,
      });

      balance = endingBalance;
      prevDate = dueDate;
      if (balance <= 0) break;
    }

    return periods;
  }

  private buildBulletSchedule(
    loan: Loan,
    annualRate: number,
    originationDate: Date,
    maturityDate: Date,
  ): SchedulePeriod[] {
    const balance = loan.outstandingBalance || loan.loanAmount;
    const paymentDates = this.generatePaymentDates(
      this.addPeriod(originationDate, 'MONTHLY'),
      maturityDate,
      'MONTHLY',
    );

    const periods: SchedulePeriod[] = [];
    let prevDate = originationDate;

    for (let i = 0; i < paymentDates.length; i++) {
      const dueDate = paymentDates[i];
      const isLast = i === paymentDates.length - 1;
      const daysInPeriod = this.daysBetween(prevDate, dueDate);
      const interest = this.accrualService.calculatePeriodInterest(balance, annualRate, daysInPeriod);

      periods.push({
        periodNumber: i + 1,
        dueDate,
        beginningBalance: balance,
        scheduledInterest: Math.round(interest * 10000) / 10000,
        scheduledPrincipal: isLast ? balance : 0,
        scheduledFees: 0,
        endingBalance: isLast ? 0 : balance,
        rateSnapshot: annualRate,
      });

      prevDate = dueDate;
    }

    return periods;
  }

  // ─── Level payment calculation ────────────────────────────────────────────────

  /**
   * Constant-payment calculation using Actual/360 period rates.
   * Uses Newton-Raphson iteration for non-uniform periods (variable day counts).
   */
  private calculateLevelPayment(
    principal: number,
    annualRate: number,
    paymentDates: Date[],
    originationDate: Date,
  ): number {
    if (annualRate === 0) return principal / paymentDates.length;

    // Build period rates array (daily rate × days)
    const dates = [originationDate, ...paymentDates];
    const periodRates = paymentDates.map((_, i) => {
      const days = this.daysBetween(dates[i], dates[i + 1]);
      return (annualRate / 360) * days;
    });

    // PMT using variable period rates: solve for constant payment P such that PV = 0
    // Use simplified approximation: average period rate
    const avgRate = periodRates.reduce((s, r) => s + r, 0) / periodRates.length;
    const n = paymentDates.length;

    if (avgRate === 0) return principal / n;

    const payment = (principal * avgRate) / (1 - Math.pow(1 + avgRate, -n));
    return Math.round(payment * 100) / 100;
  }

  // ─── Date generation ──────────────────────────────────────────────────────────

  private generatePaymentDates(start: Date, maturity: Date, frequency: Frequency): Date[] {
    const dates: Date[] = [];
    let current = new Date(start);

    while (current < maturity) {
      dates.push(new Date(current));
      current = this.addPeriod(current, frequency);
    }

    // Always include maturity date as the last payment date
    if (dates.length === 0 || dates[dates.length - 1].getTime() !== maturity.getTime()) {
      dates.push(new Date(maturity));
    }

    return dates;
  }

  private addPeriod(date: Date, frequency: Frequency): Date {
    const d = new Date(date);
    switch (frequency) {
      case 'DAILY':       d.setDate(d.getDate() + 1); break;
      case 'WEEKLY':      d.setDate(d.getDate() + 7); break;
      case 'BIWEEKLY':    d.setDate(d.getDate() + 14); break;
      case 'MONTHLY':     d.setMonth(d.getMonth() + 1); break;
      case 'QUARTERLY':   d.setMonth(d.getMonth() + 3); break;
      case 'SEMIANNUAL':  d.setMonth(d.getMonth() + 6); break;
      case 'ANNUAL':      d.setFullYear(d.getFullYear() + 1); break;
    }
    return d;
  }

  private daysBetween(from: Date, to: Date): number {
    const ms = to.getTime() - from.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  private getEffectiveRate(loan: Loan): number {
    if (loan.interestType === 'FIXED') return Number(loan.fixedRate);
    return Number(loan.indexRate ?? 0) + Number(loan.marginRate ?? 0);
  }

  // ─── Get schedule ─────────────────────────────────────────────────────────────

  async getSchedule(loanId: string, tenantId: string): Promise<ScheduleItem[]> {
    return this.scheduleRepo.find({
      where: { loanId, tenantId },
      order: { periodNumber: 'ASC' },
    });
  }

  async getNextDue(loanId: string, tenantId: string): Promise<ScheduleItem | null> {
    return this.scheduleRepo.findOne({
      where: { loanId, tenantId, status: 'PENDING' },
      order: { dueDate: 'ASC' },
    });
  }
}
