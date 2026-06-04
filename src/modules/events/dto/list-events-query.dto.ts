import { EventSourceType, EventStatus, VisibilityScope } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListEventsQueryDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsEnum(EventSourceType)
  sourceType?: EventSourceType;

  @IsOptional()
  @IsEnum(VisibilityScope)
  visibilityScope?: VisibilityScope;

  @IsOptional()
  @IsString()
  eventType?: string;
}
