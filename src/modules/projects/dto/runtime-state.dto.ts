import { IsObject, IsOptional } from 'class-validator';

export class UpdateProjectRuntimeStateDto {
  @IsOptional()
  @IsObject()
  structureTree?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  identityClaims?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  intakeSnapshot?: Record<string, unknown>;
}
