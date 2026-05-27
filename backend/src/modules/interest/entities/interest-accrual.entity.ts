import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';

@Entity('interest_accruals')
@Unique(['loanId', 'accrualDate'])
export class InterestAccrual extends BaseTenantEntity {
  @Index()
  @Column({ name: 'loan_id', type: 'uuid' })
  loanId: string;

  @Column({ name: 'accrual_date', type: 'date' })
  accrualDate: string;

  @Column({ name: 'accrual_amount', type: 'numeric', precision: 18, scale: 4 })
  accrualAmount: string;

  @Column({ name: 'principal_balance', type: 'numeric', precision: 18, scale: 2 })
  principalBalance: string;

  @Column({ name: 'annual_rate', type: 'numeric', precision: 8, scale: 6 })
  annualRate: string;

  @Column({ name: 'daily_rate', type: 'numeric', precision: 12, scale: 10 })
  dailyRate: string;
}
