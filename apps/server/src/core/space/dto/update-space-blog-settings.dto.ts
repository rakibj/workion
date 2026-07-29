import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum BlogCustomFieldType {
  BOOLEAN = 'boolean',
  NUMBER = 'number',
  TEXT = 'text',
}

export class BlogCustomFieldDefDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message:
      'key must start with a letter and contain only letters, numbers, and underscores',
  })
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @IsEnum(BlogCustomFieldType)
  type: BlogCustomFieldType;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogCustomFieldDefDto)
  customFields?: BlogCustomFieldDefDto[];
}
