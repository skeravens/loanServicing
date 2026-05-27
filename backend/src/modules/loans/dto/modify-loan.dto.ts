import { IsString, IsNumber, IsOptional, Min, Max, IsDateString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentFrequency } from '../../../common/enums';

export class ModifyLoanDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) newRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() newTermMonths?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() newMaturityDate?: string;
  @ApiPropertyOptional({ enum: PaymentFrequency }) @IsOptional() @IsEnum(PaymentFrequency) newPaymentFrequency?: PaymentFrequency;
  @ApiPropertyOptional() @IsOptional() @IsString() reason: string;
  @ApiPropertyOptional() @IsOptional() @IsString() effectiveDate?: string;
}
