import {
  IsString, IsEnum, IsNumber, IsDateString, IsOptional,
  IsPositive, IsArray, IsUUID, Min, Max, ValidateIf, IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InterestType, PaymentFrequency, AmortizationType, LoanBorrowerRole,
} from '../../../common/enums';

export class LoanBorrowerDto {
  @ApiProperty() @IsUUID() borrowerId: string;
  @ApiProperty({ enum: LoanBorrowerRole }) @IsEnum(LoanBorrowerRole) role: LoanBorrowerRole;
}

export class CreateLoanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() loanName?: string;

  @ApiProperty({ description: 'Total commitment in USD', example: 500000 })
  @IsNumber() @IsPositive()
  commitmentAmount: number;

  @ApiProperty({ enum: InterestType }) @IsEnum(InterestType) interestType: InterestType;

  @ApiPropertyOptional({ description: 'Required when interestType=FIXED', example: 0.085 })
  @ValidateIf((o) => o.interestType === InterestType.FIXED)
  @IsNumber() @Min(0) @Max(1)
  fixedRate?: number;

  @ApiPropertyOptional({ description: 'Required when interestType=FLOATING', example: 'SOFR' })
  @ValidateIf((o) => o.interestType === InterestType.FLOATING)
  @IsString()
  indexRateName?: string;

  @ApiPropertyOptional({ example: 0.02 })
  @ValidateIf((o) => o.interestType === InterestType.FLOATING)
  @IsNumber() @Min(0) @Max(1)
  marginRate?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) rateFloor?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) rateCeiling?: number;

  @ApiProperty({ enum: PaymentFrequency }) @IsEnum(PaymentFrequency) paymentFrequency: PaymentFrequency;
  @ApiProperty({ enum: AmortizationType }) @IsEnum(AmortizationType) amortizationType: AmortizationType;

  @ApiProperty({ example: 60, description: 'Loan term in months' })
  @IsNumber() @IsPositive()
  termMonths: number;

  @ApiProperty({ example: '2024-01-15' }) @IsDateString() originationDate: string;
  @ApiProperty({ example: '2024-02-15' }) @IsDateString() firstPaymentDate: string;
  @ApiPropertyOptional({ example: '2029-01-15', description: 'If omitted, calculated from originationDate + termMonths' })
  @IsOptional() @IsDateString()
  maturityDate?: string;

  @ApiProperty({ type: [LoanBorrowerDto] })
  @IsArray()
  borrowers: LoanBorrowerDto[];

  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
