import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

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
}
