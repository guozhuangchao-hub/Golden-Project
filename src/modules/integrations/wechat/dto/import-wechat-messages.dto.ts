import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ImportWechatMessageDto {
  @IsString()
  externalMessageId!: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsString()
  groupName!: string;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsString()
  senderName!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  rawPayload?: Record<string, unknown>;
}

export class ImportWechatMessagesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportWechatMessageDto)
  messages!: ImportWechatMessageDto[];
}
