import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fee } from './entities/fee.entity';
import { Loan } from '../loans/entities/loan.entity';
import { CreateFeeDto, WaiveFeeDto } from './dto/create-fee.dto';
import { FeeStatus, UserRole } from '../../common/enums';

@Injectable()
export class FeesService {
  constructor(
    @InjectRepository(Fee) private readonly repo: Repository<Fee>,
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
  ) {}

  async create(loanId: string, dto: CreateFeeDto, tenantId: string, userId: string): Promise<Fee> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId, tenantId } });
    if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);

    const fee = this.repo.create({
      loanId,
      tenantId,
      feeType: dto.feeType,
      amount: dto.amount.toString(),
      assessedDate: dto.assessedDate,
      dueDate: dto.dueDate,
      description: dto.description,
      createdBy: userId,
    });
    return this.repo.save(fee);
  }

  async findAllForLoan(loanId: string, tenantId: string): Promise<Fee[]> {
    return this.repo.find({ where: { loanId, tenantId }, order: { assessedDate: 'DESC' } });
  }

  async waive(id: string, dto: WaiveFeeDto, tenantId: string, userId: string, role: string): Promise<Fee> {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Only ADMIN can waive fees');
    const fee = await this.repo.findOne({ where: { id, tenantId } });
    if (!fee) throw new NotFoundException(`Fee ${id} not found`);
    if (fee.status !== FeeStatus.OUTSTANDING) {
      throw new BadRequestException(`Fee is already ${fee.status}`);
    }
    fee.status = FeeStatus.WAIVED;
    fee.waivedAt = new Date();
    fee.waivedBy = userId;
    fee.waiveReason = dto.reason;
    return this.repo.save(fee);
  }
}
