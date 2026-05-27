import { Entity, Column, OneToMany, ManyToMany, JoinTable, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import {
  LoanStatus,
  InterestType,
  PaymentFrequency,
  AmortizationType,
} from '../../../common/enums';
import { Borrower } from '../../borrowers/entities/borrower.entity';

@Entity('loans')
export class Loan extends BaseTenantEntity {
  @Index()
  @Column({ name: 'loan_number', type: 'varchar', length: 50, unique: true })
  loanNumber: string;

  @Column({ name: 'status', type: 'varchar', length: 30, default: LoanStatus.PENDING })
  status: LoanStatus;

  @Column({ name: 'loan_name', type: 'varchar', length: 200, nullable: true })
  loanName?: string;

  @Column({ name: 'commitment_amount', type: 'numeric', precision: 18, scale: 2 })
  commitmentAmount: string;

  @Column({ name: 'outstanding_balance', type: 'numeric', precision: 18, scale: 2, default: '0' })
  outstandingBalance: string;

  @Column({ name: 'accrued_interest', type: 'numeric', precision: 18, scale: 4, default: '0' })
  accruedInterest: string;

  @Column({ name: 'interest_type', type: 'varchar', length: 20 })
  interestType: InterestType;

  @Column({ name: 'fixed_rate', type: 'numeric', precision: 8, scale: 6, nullable: true })
  fixedRate?: string;

  @Column({ name: 'index_rate_name', type: 'varchar', length: 50, nullable: true })
  indexRateName?: string;

  @Column({ name: 'index_rate', type: 'numeric', precision: 8, scale: 6, nullable: true })
  indexRate?: string;

  @Column({ name: 'margin_rate', type: 'numeric', precision: 8, scale: 6, nullable: true })
  marginRate?: string;

  @Column({ name: 'rate_floor', type: 'numeric', precision: 8, scale: 6, nullable: true })
  rateFloor?: string;

  @Column({ name: 'rate_ceiling', type: 'numeric', precision: 8, scale: 6, nullable: true })
  rateCeiling?: string;

  @Column({ name: 'payment_frequency', type: 'varchar', length: 20 })
  paymentFrequency: PaymentFrequency;

  @Column({ name: 'amortization_type', type: 'varchar', length: 20 })
  amortizationType: AmortizationType;

  @Column({ name: 'term_months', type: 'int' })
  termMonths: number;

  @Column({ name: 'origination_date', type: 'date' })
  originationDate: string;

  @Column({ name: 'first_payment_date', type: 'date' })
  firstPaymentDate: string;

  @Column({ name: 'maturity_date', type: 'date' })
  maturityDate: string;

  @Column({ name: 'days_past_due', type: 'int', default: 0 })
  daysPastDue: number;

  @Column({ name: 'next_payment_date', type: 'date', nullable: true })
  nextPaymentDate?: string;

  @Column({ name: 'next_payment_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  nextPaymentAmount?: string;

  @Column({ name: 'last_payment_date', type: 'date', nullable: true })
  lastPaymentDate?: string;

  @Column({ name: 'last_accrual_date', type: 'date', nullable: true })
  lastAccrualDate?: string;

  @Column({ name: 'custom_fields', type: 'jsonb', default: '{}' })
  customFields: Record<string, unknown>;

  @Column({ name: 'metadata', type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @ManyToMany(() => Borrower)
  @JoinTable({
    name: 'loan_borrowers',
    joinColumn: { name: 'loan_id' },
    inverseJoinColumn: { name: 'borrower_id' },
  })
  borrowers: Borrower[];
}
