import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Borrower } from './entities/borrower.entity';
import { BorrowersController } from './borrowers.controller';
import { BorrowersService } from './borrowers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Borrower])],
  controllers: [BorrowersController],
  providers: [BorrowersService],
  exports: [BorrowersService, TypeOrmModule],
})
export class BorrowersModule {}
