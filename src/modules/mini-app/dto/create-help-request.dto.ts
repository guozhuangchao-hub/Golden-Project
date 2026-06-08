import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHelpRequestDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;
}

