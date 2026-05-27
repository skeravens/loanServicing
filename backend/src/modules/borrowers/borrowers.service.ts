import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Borrower } from './entities/borrower.entity';
import { CreateBorrowerDto } from './dto/create-borrower.dto';

@Injectable()
export class BorrowersService {
  private readonly kms: KMSClient;
  private readonly kmsKeyId: string;

  constructor(
    @InjectRepository(Borrower) private readonly repo: Repository<Borrower>,
    private readonly config: ConfigService,
  ) {
    this.kms = new KMSClient({ region: config.get('aws.region') });
    this.kmsKeyId = config.get<string>('aws.kms.keyId')!;
  }

  async create(dto: CreateBorrowerDto, tenantId: string, userId: string): Promise<Borrower> {
    const borrower = this.repo.create({
      ...dto,
      tenantId,
      createdBy: userId,
    });

    if (dto.ssn) {
      borrower.ssnEncrypted = await this.encryptField(dto.ssn);
      borrower.ssnHash = this.hashField(dto.ssn);
    }
    if (dto.taxId) {
      borrower.taxIdEncrypted = await this.encryptField(dto.taxId);
    }

    return this.repo.save(borrower);
  }

  async findAll(tenantId: string, query?: { search?: string; page?: number; limit?: number }) {
    const page = query?.page ?? 1;
    const limit = Math.min(query?.limit ?? 20, 100);
    const where = query?.search
      ? [
          { tenantId, displayName: ILike(`%${query.search}%`) },
          { tenantId, email: ILike(`%${query.search}%`) },
        ]
      : { tenantId };

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { displayName: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data: items, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, tenantId: string): Promise<Borrower> {
    const borrower = await this.repo.findOne({ where: { id, tenantId } });
    if (!borrower) throw new NotFoundException(`Borrower ${id} not found`);
    return borrower;
  }

  async update(id: string, dto: Partial<CreateBorrowerDto>, tenantId: string, userId: string): Promise<Borrower> {
    const borrower = await this.findOne(id, tenantId);
    Object.assign(borrower, dto, { updatedBy: userId });
    return this.repo.save(borrower);
  }

  private async encryptField(plaintext: string): Promise<Buffer> {
    const cmd = new EncryptCommand({
      KeyId: this.kmsKeyId,
      Plaintext: Buffer.from(plaintext),
    });
    const res = await this.kms.send(cmd);
    return Buffer.from(res.CiphertextBlob!);
  }

  async decryptField(ciphertext: Buffer): Promise<string> {
    const cmd = new DecryptCommand({ CiphertextBlob: ciphertext });
    const res = await this.kms.send(cmd);
    return Buffer.from(res.Plaintext!).toString('utf-8');
  }

  private hashField(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
