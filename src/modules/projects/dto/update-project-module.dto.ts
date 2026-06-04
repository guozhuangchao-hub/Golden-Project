import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProjectModuleDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  leaderName?: string;
}
