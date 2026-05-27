import {
  IsString, IsNumber, IsDateString, IsOptional, IsArray,
  ValidateNested, IsEnum, IsPositive, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentAllocationBucket } from '../../../common/enums';

export class AllocationItemDto {
  @ApiProperty({ enum: PaymentAllocationBucket }) @IsEnum(PaymentAllocationBucket) bucket: PaymentAllocationBucket;
  @ApiProperty({ example: 1200.00 }) @IsNumber() @IsPositive() amount: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() scheduleItemId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() feeId?: string;
}

export class CreatePaymentDto {
  @ApiProperty({ example: '2024-02-15' }) @IsDateString() paymentDate: string;
  @ApiProperty({ example: 5000.00 }) @IsNumber() @IsPositive() amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [AllocationItemDto], description: 'Must sum to amount' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => AllocationItemDto)
  allocations: AllocationItemDto[];
}
