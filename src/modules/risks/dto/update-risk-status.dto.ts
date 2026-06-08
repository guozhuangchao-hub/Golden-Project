import { RiskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRiskStatusDto {
  @IsEnum(RiskStatus)
  status!: RiskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

