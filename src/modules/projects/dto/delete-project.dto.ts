import { IsString, MinLength } from 'class-validator';

export class DeleteProjectDto {
  @IsString()
  @MinLength(1)
  password!: string;
}
