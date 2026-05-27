import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { ScheduleItemStatus } from '../../../common/enums';

@Entity('schedule_items')
export class ScheduleItem extends BaseTenantEntity {
  @Index()
  @Column({ name: 'loan_id', type: 'uuid' })
  loanId: string;

  @Column({ name: 'period_number', type: 'int' })
  periodNumber: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: ScheduleItemStatus.SCHEDULED })
  status: ScheduleItemStatus;

  @Column({ name: 'principal_due', type: 'numeric', precision: 18, scale: 2 })
  principalDue: string;

  @Column({ name: 'interest_due', type: 'numeric', precision: 18, scale: 4 })
  interestDue: string;

  @Column({ name: 'fees_due', type: 'numeric', precision: 18, scale: 2, default: '0' })
  feesDue: string;

  @Column({ name: 'principal_paid', type: 'numeric', precision: 18, scale: 2, default: '0' })
  principalPaid: string;

  @Column({ name: 'interest_paid', type: 'numeric', precision: 18, scale: 4, default: '0' })
  interestPaid: string;

  @Column({ name: 'fees_paid', type: 'numeric', precision: 18, scale: 2, default: '0' })
  feesPaid: string;

  @Column({ name: 'beginning_balance', type: 'numeric', precision: 18, scale: 2 })
  beginningBalance: string;

  @Column({ name: 'ending_balance', type: 'numeric', precision: 18, scale: 2 })
  endingBalance: string;
}
