import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disbursement } from './entities/disbursement.entity';
import { Loan } from '../loans/entities/loan.entity';
import { DisbursementsService } from './disbursements.service';

@Module({
  imports: [TypeOrmModule.forFeature([Disbursement, Loan])],
  providers: [DisbursementsService],
  exports: [DisbursementsService, TypeOrmModule],
})
export class DisbursementsModule {}
