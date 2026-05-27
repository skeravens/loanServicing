import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { PaymentAllocationBucket } from '../../../common/enums';

@Entity('payment_allocations')
export class PaymentAllocation extends BaseTenantEntity {
  @Index()
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId: string;

  @Column({ name: 'loan_id', type: 'uuid' })
  loanId: string;

  @Column({ name: 'bucket', type: 'varchar', length: 20 })
  bucket: PaymentAllocationBucket;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ name: 'schedule_item_id', type: 'uuid', nullable: true })
  scheduleItemId?: string;

  @Column({ name: 'fee_id', type: 'uuid', nullable: true })
  feeId?: string;
}
