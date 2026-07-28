import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class BlogPageIdDto {
  @IsUUID()
  pageId: string;
}

export class UpsertBlogPostSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string | null;

  @IsOptional()
  @IsString()
  metaDescription?: string | null;

  @IsOptional()
  @IsUUID()
  ogImageAttachmentId?: string | null;

  @IsOptional()
  @IsString()
  canonicalUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  robotsIndex?: boolean;

  @IsOptional()
  @IsBoolean()
  robotsFollow?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  focusKeyword?: string | null;
}
