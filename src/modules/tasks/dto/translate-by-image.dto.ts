import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PublishRecipientMode } from './publish-task.dto';

export class TranslateByImageDto {
  @IsString()
  imageBase64!: string;

  @IsString()
  imageMimeType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @IsEnum(PublishRecipientMode)
  recipientMode!: PublishRecipientMode;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  recipientMemberIds?: string[];
}
