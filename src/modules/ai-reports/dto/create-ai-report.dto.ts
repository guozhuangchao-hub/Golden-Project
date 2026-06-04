import { AIReportType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAiReportDto {
  @IsDateString()
  reportDate!: string;

  @IsOptional()
  @IsEnum(AIReportType)
  type?: AIReportType;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsObject()
  sourceData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  generatedBy?: string;
}
