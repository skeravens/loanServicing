import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Disbursement } from './entities/disbursement.entity';
import { Loan } from '../loans/entities/loan.entity';
import { CreateDisbursementDto } from './dto/create-disbursement.dto';
import { DisbursementStatus, LoanStatus, UserRole } from '../../common/enums';

@Injectable()
export class DisbursementsService {
  constructor(
    @InjectRepository(Disbursement) private readonly repo: Repository<Disbursement>,
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
    private readonly dataSource: DataSource,
  ) {}

  async create(loanId: string, dto: CreateDisbursementDto, tenantId: string, userId: string): Promise<Disbursement> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId, tenantId } });
    if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);
    if (![LoanStatus.APPROVED, LoanStatus.ACTIVE].includes(loan.status)) {
      throw new BadRequestException(`Cannot disburse against a loan in status ${loan.status}`);
    }

    const disbursed = await this.repo.sum('amount', { loanId, tenantId });
    const totalAfter = (disbursed ?? 0) + dto.amount;
    if (totalAfter > parseFloat(loan.commitmentAmount)) {
      throw new BadRequestException(
        `Disbursement would exceed commitment of ${loan.commitmentAmount}`,
      );
    }

    const d = this.repo.create({
      loanId,
      tenantId,
      amount: dto.amount.toString(),
      fees: (dto.fees ?? 0).toString(),
      disbursementDate: dto.disbursementDate,
      reference: dto.reference,
      notes: dto.notes,
      createdBy: userId,
    });
    return this.repo.save(d);
  }

  async findAllForLoan(loanId: string, tenantId: string): Promise<Disbursement[]> {
    return this.repo.find({ where: { loanId, tenantId }, order: { createdAt: 'ASC' } });
  }

  async approve(id: string, tenantId: string, userId: string, role: string): Promise<Disbursement> {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Only ADMIN can approve disbursements');
    const d = await this.repo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException(`Disbursement ${id} not found`);
    if (d.status !== DisbursementStatus.PENDING) {
      throw new BadRequestException(`Disbursement is already ${d.status}`);
    }
    d.status = DisbursementStatus.APPROVED;
    d.approvedAt = new Date();
    d.approvedBy = userId;
    d.disbursementDate = d.disbursementDate ?? new Date().toISOString().split('T')[0];
    return this.repo.save(d);
  }
}
