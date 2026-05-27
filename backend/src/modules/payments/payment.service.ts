import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Loan } from '../loans/entities/loan.entity';
import { ScheduleItem } from '../schedule/entities/schedule-item.entity';
import { Fee } from '../fees/entities/fee.entity';
import { AuditService } from '../../common/audit.service';
import { CreatePaymentDto, AllocationDto } from './dto/create-payment.dto';
import { RequestContext } from '../../common/interfaces/request-context.interface';

export type Bucket = 'PRINCIPAL' | 'INTEREST' | 'FEE' | 'PREPAYMENT';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentAllocation)
    private readonly allocationRepo: Repository<PaymentAllocation>,
    @InjectRepository(Loan)
    private readonly loanRepo: Repository<Loan>,
    @InjectRepository(ScheduleItem)
    private readonly scheduleRepo: Repository<ScheduleItem>,
    @InjectRepository(Fee)
    private readonly feeRepo: Repository<Fee>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  // ─── Apply Payment ────────────────────────────────────────────────────────────

  /**
   * Applies a payment with MANUAL allocation.
   * The caller explicitly specifies how to split the payment across buckets.
   * No automatic waterfall — full control given to the operator.
   *
   * Supports:
   *   - Partial payments (allocations < payment amount → remainder tracked)
   *   - Overpayments   (allocations > amount_due → excess goes to PREPAYMENT)
   */
  async applyPayment(
    loanId: string,
    dto: CreatePaymentDto,
    ctx: RequestContext,
  ): Promise<Payment> {
    this.assertRole(ctx.role, ['ADMIN', 'OPERATOR']);
    await this.setTenantContext(ctx.tenantId);

    return this.dataSource.transaction(async (manager) => {
      // 1. Load loan
      const loan = await manager.findOne(Loan, {
        where: { id: loanId, tenantId: ctx.tenantId },
      });
      if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);
      if (!['ACTIVE', 'CURRENT', 'DELINQUENT'].includes(loan.status)) {
        throw new BadRequestException(`Cannot apply payment to loan in status ${loan.status}`);
      }

      // 2. Validate allocations
      await this.validateAllocations(loanId, dto, loan, manager);

      // 3. Create payment record
      const paymentNumber = await this.nextPaymentNumber(loanId, manager);
      const payment = manager.create(Payment, {
        tenantId: ctx.tenantId,
        loanId,
        paymentNumber,
        paymentDate: new Date(dto.paymentDate),
        paymentAmount: dto.paymentAmount,
        status: 'APPLIED',
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        notes: dto.notes,
        createdBy: ctx.userId,
      });
      const savedPayment = await manager.save(payment);

      // 4. Create allocations and apply to loan/schedule
      let principalReduction = 0;
      let interestReduction = 0;
      let feeReduction = 0;

      for (const alloc of dto.allocations) {
        const allocation = manager.create(PaymentAllocation, {
          tenantId: ctx.tenantId,
          paymentId: savedPayment.id,
          loanId,
          scheduleItemId: alloc.scheduleItemId ?? null,
          bucket: alloc.bucket as Bucket,
          amount: alloc.amount,
        });
        await manager.save(allocation);

        // Update schedule item if referenced
        if (alloc.scheduleItemId) {
          await this.applyToScheduleItem(alloc, manager);
        }

        // Update fee if referenced
        if (alloc.feeId && alloc.bucket === 'FEE') {
          await this.applyToFee(alloc.feeId, alloc.amount, ctx.tenantId, manager);
        }

        // Accumulate totals
        if (alloc.bucket === 'PRINCIPAL' || alloc.bucket === 'PREPAYMENT') {
          principalReduction += alloc.amount;
        } else if (alloc.bucket === 'INTEREST') {
          interestReduction += alloc.amount;
        } else if (alloc.bucket === 'FEE') {
          feeReduction += alloc.amount;
        }
      }

      // 5. Update loan balances
      const newBalance = Math.max(0, Number(loan.outstandingBalance) - principalReduction);
      const newAccrued = Math.max(0, Number(loan.accruedInterest) - interestReduction);

      await manager.update(Loan, { id: loanId }, {
        outstandingBalance: newBalance,
        accruedInterest: newAccrued,
        status: newBalance <= 0 ? 'PAID_OFF' : loan.status,
      });

      // 6. Update delinquency status
      await this.refreshDelinquencyStatus(loanId, ctx.tenantId, manager);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'PAYMENT_APPLIED',
        entityType: 'PAYMENT',
        entityId: savedPayment.id,
        newState: { paymentAmount: dto.paymentAmount, allocations: dto.allocations },
        ipAddress: ctx.ipAddress,
      });

      this.logger.log({
        msg: 'Payment applied',
        paymentId: savedPayment.id,
        loanId,
        amount: dto.paymentAmount,
        tenantId: ctx.tenantId,
      });

      return savedPayment;
    });
  }

  // ─── Reverse Payment ─────────────────────────────────────────────────────────

  async reversePayment(
    paymentId: string,
    reason: string,
    ctx: RequestContext,
  ): Promise<Payment> {
    this.assertRole(ctx.role, ['ADMIN']);
    await this.setTenantContext(ctx.tenantId);

    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, {
        where: { id: paymentId, tenantId: ctx.tenantId },
        relations: ['allocations'],
      });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status === 'REVERSED') throw new BadRequestException('Payment already reversed');

      const loan = await manager.findOne(Loan, { where: { id: payment.loanId } });

      // Reverse each allocation
      for (const alloc of payment.allocations) {
        if (alloc.bucket === 'PRINCIPAL' || alloc.bucket === 'PREPAYMENT') {
          await manager.increment(Loan, { id: payment.loanId }, 'outstandingBalance', alloc.amount);
        } else if (alloc.bucket === 'INTEREST') {
          await manager.increment(Loan, { id: payment.loanId }, 'accruedInterest', alloc.amount);
        }
        if (alloc.scheduleItemId) {
          await this.reverseScheduleItem(alloc, manager);
        }
      }

      await manager.update(Payment, { id: paymentId }, {
        status: 'REVERSED',
        reversalReason: reason,
        reversedBy: paymentId,
      });

      await this.auditService.log({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'PAYMENT_REVERSED',
        entityType: 'PAYMENT',
        entityId: paymentId,
        previousState: { status: 'APPLIED' },
        newState: { status: 'REVERSED', reason },
        ipAddress: ctx.ipAddress,
      });

      return payment;
    });
  }

  // ─── Get Payment History ──────────────────────────────────────────────────────

  async getPaymentHistory(
    loanId: string,
    ctx: RequestContext,
    page = 1,
    limit = 20,
  ) {
    await this.setTenantContext(ctx.tenantId);

    const [payments, total] = await this.paymentRepo.findAndCount({
      where: { loanId, tenantId: ctx.tenantId },
      relations: ['allocations'],
      order: { paymentDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { payments, total, page, limit };
  }

  // ─── Preview Allocation (dry-run) ─────────────────────────────────────────────

  async previewAllocation(loanId: string, paymentAmount: number, ctx: RequestContext) {
    await this.setTenantContext(ctx.tenantId);

    const loan = await this.loanRepo.findOne({ where: { id: loanId, tenantId: ctx.tenantId } });
    if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);

    const overdueItems = await this.scheduleRepo.find({
      where: { loanId, status: In(['OVERDUE', 'PARTIAL']) },
      order: { dueDate: 'ASC' },
    });

    const outstandingFees = await this.feeRepo.find({
      where: { loanId, status: In(['OUTSTANDING', 'PARTIAL']) },
      order: { dueDate: 'ASC' },
    });

    // Informational only — show what would be owed
    return {
      paymentAmount,
      accruedInterest: loan.accruedInterest,
      outstandingBalance: loan.outstandingBalance,
      overdueScheduleItems: overdueItems,
      outstandingFees,
      suggestions: this.buildAllocationSuggestions(
        paymentAmount,
        loan,
        overdueItems,
        outstandingFees,
      ),
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async validateAllocations(
    loanId: string,
    dto: CreatePaymentDto,
    loan: Loan,
    manager: any,
  ): Promise<void> {
    if (!dto.allocations?.length) {
      throw new BadRequestException('At least one allocation is required');
    }

    const totalAllocated = dto.allocations.reduce((s, a) => s + Number(a.amount), 0);

    if (Math.abs(totalAllocated - dto.paymentAmount) > 0.01) {
      throw new BadRequestException(
        `Allocation total (${totalAllocated}) must equal payment amount (${dto.paymentAmount})`,
      );
    }

    // Validate principal doesn't exceed balance
    const principalAlloc = dto.allocations
      .filter((a) => a.bucket === 'PRINCIPAL')
      .reduce((s, a) => s + a.amount, 0);

    if (principalAlloc > Number(loan.outstandingBalance) + 0.01) {
      throw new BadRequestException(
        `Principal allocation (${principalAlloc}) exceeds outstanding balance (${loan.outstandingBalance})`,
      );
    }
  }

  private async applyToScheduleItem(alloc: AllocationDto, manager: any): Promise<void> {
    const item = await manager.findOne(ScheduleItem, { where: { id: alloc.scheduleItemId } });
    if (!item) return;

    if (alloc.bucket === 'PRINCIPAL') {
      item.paidPrincipal = Number(item.paidPrincipal) + alloc.amount;
    } else if (alloc.bucket === 'INTEREST') {
      item.paidInterest = Number(item.paidInterest) + alloc.amount;
    } else if (alloc.bucket === 'FEE') {
      item.paidFees = Number(item.paidFees) + alloc.amount;
    }

    const totalPaid = Number(item.paidPrincipal) + Number(item.paidInterest) + Number(item.paidFees);
    const totalDue = Number(item.scheduledTotal);
    item.status = totalPaid >= totalDue - 0.01 ? 'PAID' : totalPaid > 0 ? 'PARTIAL' : item.status;

    await manager.save(item);
  }

  private async reverseScheduleItem(alloc: PaymentAllocation, manager: any): Promise<void> {
    const item = await manager.findOne(ScheduleItem, { where: { id: alloc.scheduleItemId } });
    if (!item) return;

    if (alloc.bucket === 'PRINCIPAL') {
      item.paidPrincipal = Math.max(0, Number(item.paidPrincipal) - Number(alloc.amount));
    } else if (alloc.bucket === 'INTEREST') {
      item.paidInterest = Math.max(0, Number(item.paidInterest) - Number(alloc.amount));
    } else if (alloc.bucket === 'FEE') {
      item.paidFees = Math.max(0, Number(item.paidFees) - Number(alloc.amount));
    }

    const totalPaid = Number(item.paidPrincipal) + Number(item.paidInterest) + Number(item.paidFees);
    item.status = totalPaid <= 0 ? 'OVERDUE' : 'PARTIAL';
    await manager.save(item);
  }

  private async applyToFee(
    feeId: string,
    amount: number,
    tenantId: string,
    manager: any,
  ): Promise<void> {
    const fee = await manager.findOne(Fee, { where: { id: feeId, tenantId } });
    if (!fee) return;

    fee.amountPaid = Math.min(Number(fee.amount), Number(fee.amountPaid) + amount);
    fee.status = fee.amountPaid >= Number(fee.amount) - 0.01 ? 'PAID' : 'PARTIAL';
    await manager.save(fee);
  }

  private async refreshDelinquencyStatus(
    loanId: string,
    tenantId: string,
    manager: any,
  ): Promise<void> {
    const today = new Date();
    const overdueCount = await manager.count(ScheduleItem, {
      where: { loanId, status: 'OVERDUE' },
    });

    if (overdueCount === 0) {
      await manager.update(Loan, { id: loanId }, { daysPastDue: 0, status: 'CURRENT' });
    }
  }

  private buildAllocationSuggestions(
    paymentAmount: number,
    loan: Loan,
    overdueItems: ScheduleItem[],
    fees: Fee[],
  ) {
    // Informational only — not applied automatically
    const suggestions: Array<{ bucket: Bucket; amount: number; description: string }> = [];
    let remaining = paymentAmount;

    const interest = Math.min(remaining, Number(loan.accruedInterest));
    if (interest > 0) {
      suggestions.push({ bucket: 'INTEREST', amount: interest, description: 'Accrued interest' });
      remaining -= interest;
    }

    for (const fee of fees) {
      const feeOwed = Number(fee.amount) - Number(fee.amountPaid);
      const feeApply = Math.min(remaining, feeOwed);
      if (feeApply > 0) {
        suggestions.push({ bucket: 'FEE', amount: feeApply, description: fee.feeName });
        remaining -= feeApply;
      }
    }

    if (remaining > 0) {
      const principal = Math.min(remaining, Number(loan.outstandingBalance));
      suggestions.push({ bucket: 'PRINCIPAL', amount: principal, description: 'Principal' });
      remaining -= principal;
    }

    if (remaining > 0.01) {
      suggestions.push({ bucket: 'PREPAYMENT', amount: remaining, description: 'Prepayment / overpayment' });
    }

    return suggestions;
  }

  private async nextPaymentNumber(loanId: string, manager: any): Promise<number> {
    const result = await manager.query(
      `SELECT COALESCE(MAX(payment_number), 0) + 1 AS next FROM payments WHERE loan_id = $1`,
      [loanId],
    );
    return result[0].next;
  }

  private async setTenantContext(tenantId: string): Promise<void> {
    await this.dataSource.query(`SET app.current_tenant_id = '${tenantId}'`);
  }

  private assertRole(role: string, allowed: string[]): void {
    if (!allowed.includes(role)) throw new ForbiddenException(`Role ${role} cannot perform this action`);
  }
}

// Helper import needed above
import { In } from 'typeorm';
