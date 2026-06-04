import { IsString, MaxLength } from 'class-validator';

export class BootstrapProjectDto {
  @IsString()
  @MaxLength(200)
  name!: string;
}
