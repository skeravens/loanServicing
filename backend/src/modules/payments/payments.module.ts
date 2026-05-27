import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Loan } from '../loans/entities/loan.entity';
import { ScheduleItem } from '../schedule/entities/schedule-item.entity';
import { Fee } from '../fees/entities/fee.entity';
import { PaymentService } from './payment.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PaymentAllocation, Loan, ScheduleItem, Fee])],
  providers: [PaymentService],
  exports: [PaymentService, TypeOrmModule],
})
export class PaymentsModule {}
