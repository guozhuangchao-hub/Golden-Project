import { TaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  toStatus!: TaskStatus;

  @IsOptional()
  @IsString()
  content?: string;
}
