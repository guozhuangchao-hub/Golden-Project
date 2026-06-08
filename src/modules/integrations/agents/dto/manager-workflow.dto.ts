import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ManagerWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  focus?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(600)
  @Type(() => Number)
  timeoutSeconds?: number;
}

