import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan } from './entities/loan.entity';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { ScheduleItemModule } from '../schedule/schedule.module';
import { Borrower } from '../borrowers/entities/borrower.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Borrower]), ScheduleItemModule],
  controllers: [LoanController],
  providers: [LoanService],
  exports: [LoanService, TypeOrmModule],
})
export class LoansModule {}
