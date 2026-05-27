import {
  IsString, IsEnum, IsEmail, IsOptional, Length, Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BorrowerType } from '../../../common/enums';

export class CreateBorrowerDto {
  @ApiProperty({ enum: BorrowerType }) @IsEnum(BorrowerType) borrowerType: BorrowerType;
  @ApiProperty({ example: 'Acme Industries LLC' }) @IsString() @Length(1, 200) displayName: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postalCode?: string;
  /** Raw SSN/TaxID — encrypted at service layer before persistence */
  @ApiPropertyOptional({ description: 'SSN (individuals) — encrypted at rest' })
  @IsOptional() @IsString() @Matches(/^\d{9}$/, { message: 'SSN must be 9 digits' })
  ssn?: string;
  @ApiPropertyOptional({ description: 'EIN/Tax ID (entities)' })
  @IsOptional() @IsString() taxId?: string;
}
