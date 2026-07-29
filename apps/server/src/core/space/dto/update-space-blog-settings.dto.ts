import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateSpaceBlogSettingsDto {
  @IsUUID()
  spaceId: string;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsOptional()
  @Matches(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
    { message: 'domain must be a valid hostname' },
  )
  domain: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === ''
      ? undefined
      : value?.trim(),
  )
  @IsString()
  @Matches(/^\/[a-z0-9][a-z0-9-]*$/i, {
    message: 'basePath must be one URL path segment beginning with /',
  })
  basePath?: string;
}
