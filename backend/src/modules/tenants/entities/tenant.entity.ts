import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'name', type: 'varchar', length: 200 }) name: string;
  @Column({ name: 'slug', type: 'varchar', length: 100, unique: true }) slug: string;
  @Column({ name: 'active', type: 'boolean', default: true }) active: boolean;
  @Column({ name: 'settings', type: 'jsonb', default: '{}' }) settings: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
