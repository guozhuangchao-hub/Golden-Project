import { IsOptional, IsArray, IsString, MaxLength } from 'class-validator';

export class IntakeSyncDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  modules?: Array<{ name: string; desc?: string; leader?: string }>;

  @IsOptional()
  @IsArray()
  members?: Array<{ name: string; role?: string; title?: string }>;

  @IsOptional()
  @IsArray()
  tasks?: Array<{ title: string; owner?: string; deadline?: string; priority?: string }>;
}
