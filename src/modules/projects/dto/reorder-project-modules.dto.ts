import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReorderProjectModulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  moduleIds!: string[];
}
