import { TaskUpdateType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTaskUpdateDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsEnum(TaskUpdateType)
  type!: TaskUpdateType;

  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;
}

