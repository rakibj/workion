import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BlogPostSettingsRepo } from '@docmost/db/repos/blog/blog-post-settings.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { jsonToHtml } from '../../../collaboration/collaboration.util';

type Selector = { domain?: string; spaceId?: string };

@Injectable()
export class BlogPublicService {
  constructor(
    private readonly blogPostSettingsRepo: BlogPostSettingsRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  async resolveSpace({ domain, spaceId }: Selector) {
    if ((domain && spaceId) || (!domain && !spaceId)) {
      throw new BadRequestException('Provide exactly one of domain or spaceId');
    }
    const space = domain
      ? await this.blogPostSettingsRepo.findSpaceByBlogDomain(domain)
      : await this.blogPostSettingsRepo.findSpaceById(spaceId);
    if (!space) throw new NotFoundException('Blog not found');
    return space;
  }

  async getPost(selector: Selector, slug: string) {
    const space = await this.resolveSpace(selector);
    const post = await this.blogPostSettingsRepo.findPublishedBySlug(space.id, slug);
    if (!post || (await this.pagePermissionRepo.hasRestrictedAncestor(post.pageId))) {
      throw new NotFoundException('Blog post not found');
    }
    return this.serializePost(post);
  }

  async listPosts(selector: Selector, page: number, limit: number) {
    const space = await this.resolveSpace(selector);
    // Fetch a modestly larger window, then apply the ancestor guard that is also
    // used by public shares. This keeps restricted pages invisible to all readers.
    const rows = await this.blogPostSettingsRepo.listPublished(
      space.id,
      limit + 1,
      (page - 1) * limit,
    );
    const visible = [];
    for (const row of rows) {
      if (!(await this.pagePermissionRepo.hasRestrictedAncestor(row.pageId))) {
        visible.push(this.serializePost(row, false));
      }
    }
    return {
      items: visible.slice(0, limit),
      meta: { page, limit, hasNextPage: rows.length > limit },
    };
  }

  async getPrimaryPost(slug: string) {
    const post = await this.blogPostSettingsRepo.findPublishedBySlugAnywhere(slug);
    if (!post || (await this.pagePermissionRepo.hasRestrictedAncestor(post.pageId))) {
      throw new NotFoundException('Blog post not found');
    }
    return this.serializePost(post);
  }

  async listPrimaryPosts(page: number, limit: number) {
    const rows = await this.blogPostSettingsRepo.listPublishedAnywhere(
      limit + 1,
      (page - 1) * limit,
    );
    const items = [];
    for (const row of rows) {
      if (!(await this.pagePermissionRepo.hasRestrictedAncestor(row.pageId))) {
        items.push(this.serializePost(row, false));
      }
    }
    return { items: items.slice(0, limit), meta: { page, limit, hasNextPage: rows.length > limit } };
  }

  async listAllPosts(selector: Selector) {
    const space = await this.resolveSpace(selector);
    return this.visiblePosts(await this.blogPostSettingsRepo.listAllPublished(space.id));
  }

  async listAllPrimaryPosts() {
    return this.visiblePosts(await this.blogPostSettingsRepo.listAllPublishedAnywhere());
  }

  private async visiblePosts(rows: any[]) {
    const items = [];
    for (const row of rows) {
      if (!(await this.pagePermissionRepo.hasRestrictedAncestor(row.pageId))) {
        items.push(this.serializePost(row, false));
      }
    }
    return items;
  }

  private serializePost(post: any, includeHtml = true) {
    return {
      id: post.pageId,
      title: post.title ?? 'Untitled',
      slug: post.slug,
      ...(includeHtml ? { html: jsonToHtml(post.content) } : {}),
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      ogImageAttachmentId: post.ogImageAttachmentId,
      canonicalUrl: post.canonicalUrl,
      robotsIndex: post.robotsIndex,
      robotsFollow: post.robotsFollow,
      focusKeyword: post.focusKeyword,
      customFields: post.customFields ?? {},
      author: { name: post.authorName ?? 'Unknown' },
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    };
  }
}
