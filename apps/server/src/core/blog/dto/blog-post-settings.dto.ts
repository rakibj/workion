import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class BlogPageIdDto {
  @IsUUID()
  pageId: string;
}

// Space-level custom field keys (Space Settings -> Blog -> Custom fields) may
// not reuse these — they're already first-class BlogPostSettings columns, and
// a colliding key would render the same concept twice in the settings modal.
export const RESERVED_BLOG_CUSTOM_FIELD_KEYS = [
  'slug',
  'metatitle',
  'metadescription',
  'ogimageattachmentid',
  'canonicalurl',
  'robotsindex',
  'robotsfollow',
  'focuskeyword',
  'tags',
  'category',
  'featured',
  'priority',
];

// Keys are constrained to [a-zA-Z][a-zA-Z0-9_]*, but labels are free text —
// a custom field can dodge the key check above (e.g. key "featuredOnHome")
// while its label still reads as the same built-in field to a user ("Featured
// on Home" vs. the built-in "Featured on home"). Block on normalized label
// too. Normalization: lowercase, trim, collapse internal whitespace.
export const RESERVED_BLOG_CUSTOM_FIELD_LABELS = [
  'slug',
  'meta title',
  'meta description',
  'og image attachment id',
  'canonical url',
  'allow search indexing',
  'allow search engines to follow links',
  'focus keyword',
  'tags',
  'category',
  'featured on home',
  'priority',
];

export function normalizeBlogFieldLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

export class BlogCategoriesQueryDto {
  @IsUUID()
  spaceId: string;
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

  @IsOptional()
  @IsObject()
  customFields?: Record<string, boolean | number | string>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;
}
