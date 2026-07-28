import { ConflictException, Injectable } from '@nestjs/common';
import { BlogPostSettingsRepo } from '@docmost/db/repos/blog/blog-post-settings.repo';
import {
  BlogPostSettings,
  InsertableBlogPostSettings,
} from '@docmost/db/types/entity.types';

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

    const { title: _title, ...settings } = input;
    return this.blogPostSettingsRepo.upsert({ ...settings, slug });
  }

  private toSlug(value: string): string {
    return (
      value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'untitled'
    );
  }
}
