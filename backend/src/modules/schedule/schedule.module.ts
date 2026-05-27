import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleItem } from './entities/schedule-item.entity';
import { Loan } from '../loans/entities/loan.entity';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduleItem, Loan])],
  providers: [ScheduleService],
  exports: [ScheduleService, TypeOrmModule],
})
export class ScheduleItemModule {}
