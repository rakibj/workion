import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { BlogPostSettingsRepo } from '@docmost/db/repos/blog/blog-post-settings.repo';
import {
  BlogPostSettings,
  InsertableBlogPostSettings,
} from '@docmost/db/types/entity.types';
import {
  BlogCustomFieldDefDto,
  BlogCustomFieldType,
} from '../../space/dto/update-space-blog-settings.dto';

export type UpsertBlogPostSettingsInput = Omit<
  InsertableBlogPostSettings,
  'slug'
> & {
  slug?: string;
  title: string;
};

@Injectable()
export class BlogPostSettingsService {
  constructor(private readonly blogPostSettingsRepo: BlogPostSettingsRepo) {}

  async findByPageId(pageId: string): Promise<BlogPostSettings | undefined> {
    return this.blogPostSettingsRepo.findByPageId(pageId);
  }

  async upsert(input: UpsertBlogPostSettingsInput): Promise<BlogPostSettings> {
    const slug = this.toSlug(input.slug ?? input.title);
    const existing = await this.blogPostSettingsRepo.findBySlugInSpace(
      input.spaceId,
      slug,
    );

    if (existing && existing.pageId !== input.pageId) {
      throw new ConflictException('A blog post with this slug already exists');
    }

    if (input.customFields) {
      await this.validateCustomFields(
        input.spaceId,
        input.customFields as Record<string, boolean | number | string>,
      );
    }

    const { title: _title, ...settings } = input;
    return this.blogPostSettingsRepo.upsert({
      ...settings,
      slug,
      tags: input.tags ? this.normalizeTags(input.tags as string[]) : undefined,
    });
  }

  async findCategories(spaceId: string): Promise<string[]> {
    return this.blogPostSettingsRepo.findDistinctCategories(spaceId);
  }

  private normalizeTags(tags: string[]): string[] {
    return tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }

  private async validateCustomFields(
    spaceId: string,
    customFields: Record<string, boolean | number | string>,
  ): Promise<void> {
    const space = await this.blogPostSettingsRepo.findSpaceById(spaceId);
    const schema: BlogCustomFieldDefDto[] =
      (space?.settings as any)?.blog?.customFields ?? [];
    const schemaByKey = new Map(schema.map((field) => [field.key, field]));

    for (const [key, value] of Object.entries(customFields)) {
      const def = schemaByKey.get(key);
      if (!def) {
        throw new BadRequestException(`Unknown custom field "${key}"`);
      }
      if (!this.matchesType(value, def.type)) {
        throw new BadRequestException(
          `Custom field "${key}" must be a ${def.type}`,
        );
      }
    }
  }

  private matchesType(value: unknown, type: BlogCustomFieldType): boolean {
    switch (type) {
      case BlogCustomFieldType.BOOLEAN:
        return typeof value === 'boolean';
      case BlogCustomFieldType.NUMBER:
        return typeof value === 'number' && Number.isFinite(value);
      case BlogCustomFieldType.TEXT:
        return typeof value === 'string';
      default:
        return false;
    }
  }

  private readonly combiningMarksPattern = new RegExp(
    `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
    'g',
  );

  private toSlug(value: string): string {
    return (
      value
        .normalize('NFKD')
        .replace(this.combiningMarksPattern, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'untitled'
    );
  }
}
