import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fee } from './entities/fee.entity';
import { Loan } from '../loans/entities/loan.entity';
import { FeesService } from './fees.service';

@Module({
  imports: [TypeOrmModule.forFeature([Fee, Loan])],
  providers: [FeesService],
  exports: [FeesService, TypeOrmModule],
})
export class FeesModule {}
