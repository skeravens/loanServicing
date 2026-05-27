import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { PaymentAllocation } from './payment-allocation.entity';

@Entity('payments')
export class Payment extends BaseTenantEntity {
  @Index()
  @Column({ name: 'loan_id', type: 'uuid' })
  loanId: string;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ name: 'reference', type: 'varchar', length: 100, nullable: true })
  reference?: string;

  @Column({ name: 'reversed', type: 'boolean', default: false })
  reversed: boolean;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt?: Date;

  @Column({ name: 'reversed_by', type: 'uuid', nullable: true })
  reversedBy?: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string;

  @OneToMany(() => PaymentAllocation, (a) => a.paymentId, { cascade: true, eager: true })
  allocations: PaymentAllocation[];
}
