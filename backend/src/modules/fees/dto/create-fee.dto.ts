import { IsEnum, IsNumber, IsDateString, IsOptional, IsString, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeType } from '../../../common/enums';

export class CreateFeeDto {
  @ApiProperty({ enum: FeeType }) @IsEnum(FeeType) feeType: FeeType;
  @ApiProperty({ example: 250 }) @IsNumber() @IsPositive() amount: number;
  @ApiProperty({ example: '2024-02-15' }) @IsDateString() assessedDate: string;
  @ApiPropertyOptional({ example: '2024-03-01' }) @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class WaiveFeeDto {
  @ApiProperty() @IsString() reason: string;
}
