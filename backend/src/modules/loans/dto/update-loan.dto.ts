import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLoanDto } from './create-loan.dto';

export class UpdateLoanDto extends PartialType(
  OmitType(CreateLoanDto, ['borrowers'] as const),
) {}
