import { Entity, Column, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { BorrowerType } from '../../../common/enums';

@Entity('borrowers')
export class Borrower extends BaseTenantEntity {
  @Column({ name: 'borrower_type', type: 'varchar', length: 20 })
  borrowerType: BorrowerType;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName: string;

  @Column({ name: 'email', type: 'varchar', length: 200, nullable: true })
  email?: string;

  @Column({ name: 'phone', type: 'varchar', length: 30, nullable: true })
  phone?: string;

  @Column({ name: 'address_line1', type: 'varchar', length: 200, nullable: true })
  addressLine1?: string;

  @Column({ name: 'address_line2', type: 'varchar', length: 200, nullable: true })
  addressLine2?: string;

  @Column({ name: 'city', type: 'varchar', length: 100, nullable: true })
  city?: string;

  @Column({ name: 'state', type: 'varchar', length: 50, nullable: true })
  state?: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode?: string;

  @Column({ name: 'country', type: 'varchar', length: 2, default: 'US' })
  country: string;

  // PII stored encrypted as BYTEA in DB; decrypted at service layer
  @Column({ name: 'ssn_encrypted', type: 'bytea', nullable: true, select: false })
  ssnEncrypted?: Buffer;

  @Column({ name: 'ssn_hash', type: 'varchar', length: 64, nullable: true })
  ssnHash?: string;

  @Column({ name: 'tax_id_encrypted', type: 'bytea', nullable: true, select: false })
  taxIdEncrypted?: Buffer;

  @Column({ name: 'metadata', type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;
}
