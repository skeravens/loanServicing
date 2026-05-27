import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterestAccrual } from './entities/interest-accrual.entity';
import { Loan } from '../loans/entities/loan.entity';
import { InterestAccrualService } from './interest-accrual.service';

@Module({
  imports: [TypeOrmModule.forFeature([InterestAccrual, Loan])],
  providers: [InterestAccrualService],
  exports: [InterestAccrualService],
})
export class InterestModule {}
