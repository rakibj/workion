import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class PublicBlogSelectorDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim().toLowerCase())
  domain?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class ListPublicBlogPostsDto extends PublicBlogSelectorDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class PublicBlogFeedDto extends PublicBlogSelectorDto {
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  baseUrl?: string;
}
