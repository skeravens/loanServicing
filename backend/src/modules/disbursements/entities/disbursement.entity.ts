import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { DisbursementStatus } from '../../../common/enums';

@Entity('disbursements')
export class Disbursement extends BaseTenantEntity {
  @Index()
  @Column({ name: 'loan_id', type: 'uuid' })
  loanId: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: DisbursementStatus.PENDING })
  status: DisbursementStatus;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ name: 'fees', type: 'numeric', precision: 18, scale: 2, default: '0' })
  fees: string;

  @Column({ name: 'disbursement_date', type: 'date', nullable: true })
  disbursementDate?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'reference', type: 'varchar', length: 100, nullable: true })
  reference?: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'metadata', type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;
}
