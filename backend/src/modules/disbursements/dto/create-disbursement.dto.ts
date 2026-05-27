import { IsNumber, IsDateString, IsOptional, IsString, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDisbursementDto {
  @ApiProperty({ example: 250000 }) @IsNumber() @IsPositive() amount: number;
  @ApiPropertyOptional({ example: 2500, description: 'Origination fee deducted from proceeds' })
  @IsOptional() @IsNumber() fees?: number;
  @ApiPropertyOptional({ example: '2024-01-15' }) @IsOptional() @IsDateString() disbursementDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
