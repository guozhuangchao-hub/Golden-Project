import { EventSourceType, VisibilityScope } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @MaxLength(100)
  eventType!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsEnum(EventSourceType)
  sourceType!: EventSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceSender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourceSenderRole?: string;

  @IsOptional()
  @IsString()
  rawContent?: string;

  @IsOptional()
  @IsEnum(VisibilityScope)
  visibilityScope?: VisibilityScope;

  @IsOptional()
  @IsObject()
  aiResult?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  proposedChanges?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  createdById?: string;
}
