import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import awsConfig from './config/aws.config';

import { Logger } from './common/logger/logger.service';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BorrowersModule } from './modules/borrowers/borrowers.module';
import { LoansModule } from './modules/loans/loans.module';
import { DisbursementsModule } from './modules/disbursements/disbursements.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ScheduleItemModule } from './modules/schedule/schedule.module';
import { FeesModule } from './modules/fees/fees.module';
import { InterestModule } from './modules/interest/interest.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    // ── Configuration ─────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, awsConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Database ──────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        type: 'postgres',
        host: cs.get('database.host'),
        port: cs.get<number>('database.port'),
        username: cs.get('database.username'),
        password: cs.get('database.password'),
        database: cs.get('database.name'),
        ssl: cs.get('database.ssl') ? { rejectUnauthorized: false } : false,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/**/*{.ts,.js}'],
        migrationsRun: false,
        synchronize: false,
        logging: cs.get('app.env') === 'development' ? ['query', 'error'] : ['error'],
        extra: {
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
      }),
    }),

    // ── Rate limiting ─────────────────────────────────────────────
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),

    // ── Scheduler (cron jobs) ─────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Feature modules ───────────────────────────────────────────
    AuthModule,
    TenantsModule,
    BorrowersModule,
    LoansModule,
    DisbursementsModule,
    PaymentsModule,
    ScheduleItemModule,
    FeesModule,
    InterestModule,
    ReportsModule,
    AuditModule,
  ],
  providers: [Logger],
  exports: [Logger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Attach tenant context on every request (reads X-Tenant-ID header or JWT claim)
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
