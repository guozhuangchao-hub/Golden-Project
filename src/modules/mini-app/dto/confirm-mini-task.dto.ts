import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmMiniTaskDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  content?: string;
}

