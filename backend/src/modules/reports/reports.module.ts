import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan } from '../loans/entities/loan.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ReportService } from './report.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Payment])],
  providers: [ReportService],
  controllers: [ReportsController],
  exports: [ReportService],
})
export class ReportsModule {}
