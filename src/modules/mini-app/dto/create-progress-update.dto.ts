import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateProgressUpdateDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsString()
  @MaxLength(2000)
  content!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent!: number;
}

