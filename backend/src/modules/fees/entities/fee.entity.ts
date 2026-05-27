import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { FeeType, FeeStatus } from '../../../common/enums';

@Entity('fees')
export class Fee extends BaseTenantEntity {
  @Index()
  @Column({ name: 'loan_id', type: 'uuid' })
  loanId: string;

  @Column({ name: 'fee_type', type: 'varchar', length: 30 })
  feeType: FeeType;

  @Column({ name: 'status', type: 'varchar', length: 20, default: FeeStatus.OUTSTANDING })
  status: FeeStatus;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ name: 'amount_paid', type: 'numeric', precision: 18, scale: 2, default: '0' })
  amountPaid: string;

  @Column({ name: 'assessed_date', type: 'date' })
  assessedDate: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate?: string;

  @Column({ name: 'waived_at', type: 'timestamptz', nullable: true })
  waivedAt?: Date;

  @Column({ name: 'waived_by', type: 'uuid', nullable: true })
  waivedBy?: string;

  @Column({ name: 'waive_reason', type: 'text', nullable: true })
  waiveReason?: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;
}
