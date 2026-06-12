import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class IntakeSyncModuleDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  desc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  leader?: string;
}

class IntakeSyncMemberDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(['组长', '管理员', '执行人员', '临时人员'])
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}

class IntakeSyncTaskDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  owner?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;
}

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
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntakeSyncModuleDto)
  modules?: IntakeSyncModuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntakeSyncMemberDto)
  members?: IntakeSyncMemberDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntakeSyncTaskDto)
  tasks?: IntakeSyncTaskDto[];
}
