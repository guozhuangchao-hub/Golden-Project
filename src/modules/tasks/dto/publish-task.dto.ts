import { TaskPriority } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum PublishRecipientMode {
  single = 'single',
  multi = 'multi',
  all = 'all',
}

export class TranslateTaskDto {
  @IsString()
  @MaxLength(500)
  text!: string;

  @IsEnum(PublishRecipientMode)
  recipientMode!: PublishRecipientMode;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  recipientMemberIds?: string[];
}

export class PublishTaskDto extends TranslateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  moduleId?: string;

  @IsOptional()
  @IsString()
  moduleName?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  dueTime?: string;
}
