import { EventStatus, VisibilityScope } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReviewEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @IsOptional()
  @IsEnum(VisibilityScope)
  visibilityScope?: VisibilityScope;

  @IsOptional()
  @IsObject()
  proposedChanges?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  confirmedById?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  createTask?: boolean;
}

export class UpdateEventStatusDto {
  @IsEnum(EventStatus)
  status!: EventStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
