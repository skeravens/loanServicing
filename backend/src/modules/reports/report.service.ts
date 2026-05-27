import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { ReportSnapshot } from './entities/report-snapshot.entity';

export interface ActiveLoanReport {
  snapshotDate: string;
  tenantId: string;
  totalLoans: number;
  totalOutstanding: number;
  totalAccruedInterest: number;
  byStatus: Record<string, { count: number; balance: number }>;
  byInterestType: Record<string, { count: number; balance: number }>;
  loans: ActiveLoanRow[];
}

export interface DelinquencyReport {
  snapshotDate: string;
  tenantId: string;
  totalDelinquent: number;
  totalAmountPastDue: number;
  buckets: Record<string, { count: number; balance: number; amountPastDue: number }>;
  loans: DelinquencyRow[];
}

export interface AmountDueReport {
  snapshotDate: string;
  tenantId: string;
  fromDate: string;
  toDate: string;
  totalPrincipalDue: number;
  totalInterestDue: number;
  totalFeesDue: number;
  totalDue: number;
  items: AmountDueRow[];
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
  private readonly s3Client: S3Client;

  constructor(
    @InjectRepository(ReportSnapshot)
    private readonly snapshotRepo: Repository<ReportSnapshot>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
    });
  }

  // ─── Active Loans Report ──────────────────────────────────────────────────────

  async getActiveLoansReport(tenantId: string): Promise<ActiveLoanReport> {
    await this.setTenantContext(tenantId);
    const snapshotDate = new Date().toISOString().split('T')[0];

    const rows = await this.dataSource.query<ActiveLoanRow[]>(
      `SELECT
         l.id                                                    AS loan_id,
         l.loan_number,
         l.status,
         l.interest_type,
         COALESCE(l.fixed_rate, l.index_rate + l.margin_rate)   AS effective_rate,
         l.outstanding_balance,
         l.accrued_interest,
         l.origination_date,
         l.maturity_date,
         l.next_payment_date,
         l.days_past_due,
         COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'DISBURSED'), 0) AS total_disbursed
       FROM loans l
       LEFT JOIN disbursements d ON d.loan_id = l.id
       WHERE l.tenant_id = $1
         AND l.status IN ('ACTIVE','CURRENT','DELINQUENT','DEFAULT')
       GROUP BY l.id
       ORDER BY l.loan_number`,
      [tenantId],
    );

    const byStatus: Record<string, { count: number; balance: number }> = {};
    const byInterestType: Record<string, { count: number; balance: number }> = {};

    for (const row of rows) {
      byStatus[row.status] ??= { count: 0, balance: 0 };
      byStatus[row.status].count++;
      byStatus[row.status].balance += Number(row.outstanding_balance);

      byInterestType[row.interest_type] ??= { count: 0, balance: 0 };
      byInterestType[row.interest_type].count++;
      byInterestType[row.interest_type].balance += Number(row.outstanding_balance);
    }

    return {
      snapshotDate,
      tenantId,
      totalLoans: rows.length,
      totalOutstanding: rows.reduce((s, r) => s + Number(r.outstanding_balance), 0),
      totalAccruedInterest: rows.reduce((s, r) => s + Number(r.accrued_interest), 0),
      byStatus,
      byInterestType,
      loans: rows,
    };
  }

  // ─── Delinquency Report ───────────────────────────────────────────────────────

  async getDelinquencyReport(tenantId: string): Promise<DelinquencyReport> {
    await this.setTenantContext(tenantId);
    const snapshotDate = new Date().toISOString().split('T')[0];

    const rows = await this.dataSource.query<DelinquencyRow[]>(
      `SELECT
         l.id                AS loan_id,
         l.loan_number,
         l.outstanding_balance,
         l.days_past_due,
         l.next_payment_date,
         CASE
           WHEN l.days_past_due BETWEEN 1  AND 30  THEN '1-30'
           WHEN l.days_past_due BETWEEN 31 AND 60  THEN '31-60'
           WHEN l.days_past_due BETWEEN 61 AND 90  THEN '61-90'
           WHEN l.days_past_due > 90               THEN '90+'
         END AS delinquency_bucket,
         COALESCE(
           SUM(si.scheduled_total - si.paid_principal - si.paid_interest - si.paid_fees),
           0
         ) AS amount_past_due
       FROM loans l
       LEFT JOIN schedule_items si ON si.loan_id = l.id
                                  AND si.status IN ('OVERDUE','PARTIAL')
       WHERE l.tenant_id = $1
         AND l.days_past_due > 0
       GROUP BY l.id
       ORDER BY l.days_past_due DESC`,
      [tenantId],
    );

    const buckets: Record<string, { count: number; balance: number; amountPastDue: number }> = {};
    for (const row of rows) {
      const b = row.delinquency_bucket;
      buckets[b] ??= { count: 0, balance: 0, amountPastDue: 0 };
      buckets[b].count++;
      buckets[b].balance += Number(row.outstanding_balance);
      buckets[b].amountPastDue += Number(row.amount_past_due);
    }

    return {
      snapshotDate,
      tenantId,
      totalDelinquent: rows.length,
      totalAmountPastDue: rows.reduce((s, r) => s + Number(r.amount_past_due), 0),
      buckets,
      loans: rows,
    };
  }

  // ─── Amount Due Report ────────────────────────────────────────────────────────

  async getAmountDueReport(
    tenantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<AmountDueReport> {
    await this.setTenantContext(tenantId);

    const items = await this.dataSource.query<AmountDueRow[]>(
      `SELECT
         l.loan_number,
         si.period_number,
         si.due_date,
         si.scheduled_principal - si.paid_principal AS principal_due,
         si.scheduled_interest  - si.paid_interest  AS interest_due,
         si.scheduled_fees      - si.paid_fees       AS fees_due,
         (si.scheduled_total - si.paid_principal - si.paid_interest - si.paid_fees) AS total_due
       FROM schedule_items si
       JOIN loans l ON l.id = si.loan_id
       WHERE l.tenant_id = $1
         AND si.due_date BETWEEN $2 AND $3
         AND si.status IN ('PENDING','PARTIAL','OVERDUE')
       ORDER BY si.due_date, l.loan_number`,
      [tenantId, fromDate, toDate],
    );

    return {
      snapshotDate: new Date().toISOString().split('T')[0],
      tenantId,
      fromDate,
      toDate,
      totalPrincipalDue: items.reduce((s, i) => s + Number(i.principal_due), 0),
      totalInterestDue: items.reduce((s, i) => s + Number(i.interest_due), 0),
      totalFeesDue: items.reduce((s, i) => s + Number(i.fees_due), 0),
      totalDue: items.reduce((s, i) => s + Number(i.total_due), 0),
      items,
    };
  }

  // ─── Snowflake Export Pipeline ────────────────────────────────────────────────

  /**
   * Exports report data as newline-delimited JSON to S3.
   * A Snowflake external stage + COPY INTO pipe picks up from the S3 prefix.
   *
   * S3 path: s3://{bucket}/exports/{tenantId}/{reportType}/{date}/data.jsonl
   */
  async exportToSnowflake(
    tenantId: string,
    reportType: 'ACTIVE_LOANS' | 'DELINQUENCY' | 'AMOUNT_DUE',
    fromDate?: string,
    toDate?: string,
  ): Promise<{ s3Key: string; recordCount: number }> {
    const date = new Date().toISOString().split('T')[0];
    const bucket = this.configService.get<string>('S3_EXPORT_BUCKET');
    const s3Key = `exports/${tenantId}/${reportType.toLowerCase()}/${date}/data.jsonl`;

    let data: unknown[];
    let recordCount: number;

    switch (reportType) {
      case 'ACTIVE_LOANS': {
        const report = await this.getActiveLoansReport(tenantId);
        data = report.loans;
        recordCount = data.length;
        break;
      }
      case 'DELINQUENCY': {
        const report = await this.getDelinquencyReport(tenantId);
        data = report.loans;
        recordCount = data.length;
        break;
      }
      case 'AMOUNT_DUE': {
        const report = await this.getAmountDueReport(tenantId, fromDate!, toDate!);
        data = report.items;
        recordCount = data.length;
        break;
      }
    }

    // Enrich rows with metadata for Snowflake
    const enriched = data.map((row) => ({
      ...row,
      _tenant_id: tenantId,
      _export_date: date,
      _report_type: reportType,
      _ingested_at: new Date().toISOString(),
    }));

    const ndjson = enriched.map((r) => JSON.stringify(r)).join('\n');

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: Buffer.from(ndjson, 'utf-8'),
        ContentType: 'application/x-ndjson',
        ServerSideEncryption: 'aws:kms',
        Metadata: {
          tenantId,
          reportType,
          exportDate: date,
          recordCount: String(recordCount),
        },
      }),
    );

    // Record snapshot
    await this.snapshotRepo.save(
      this.snapshotRepo.create({
        tenantId,
        reportType,
        snapshotDate: new Date(date),
        data: { recordCount, s3Key },
        exportedToS3: true,
        s3Key,
        exportedAt: new Date(),
      }),
    );

    this.logger.log({
      msg: 'Report exported to S3',
      tenantId,
      reportType,
      s3Key,
      recordCount,
    });

    return { s3Key, recordCount };
  }

  private async setTenantContext(tenantId: string): Promise<void> {
    await this.dataSource.query(`SET app.current_tenant_id = '${tenantId}'`);
  }
}

// Type stubs (would be in separate files)
interface ActiveLoanRow { loan_id: string; loan_number: string; status: string; interest_type: string; effective_rate: number; outstanding_balance: number; accrued_interest: number; origination_date: string; maturity_date: string; next_payment_date: string; days_past_due: number; total_disbursed: number; }
interface DelinquencyRow { loan_id: string; loan_number: string; outstanding_balance: number; days_past_due: number; next_payment_date: string; delinquency_bucket: string; amount_past_due: number; }
interface AmountDueRow { loan_number: string; period_number: number; due_date: string; principal_due: number; interest_due: number; fees_due: number; total_due: number; }
