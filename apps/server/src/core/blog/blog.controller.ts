import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EntitlementGuard } from '../../common/entitlement/entitlement.guard';
import { RequireFeature } from '../../common/entitlement/require-feature.decorator';
import { WorkionFeature } from '../../common/entitlement/entitlement';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { ShareService } from '../share/share.service';
import { AiStreamService } from '../ai-chat/services/ai-stream.service';
import { BlogPostSettingsService } from './services/blog-post-settings.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import {
  BlogCategoriesQueryDto,
  BlogPageIdDto,
  UpsertBlogPostSettingsDto,
} from './dto/blog-post-settings.dto';
import { PublishBlogPostDto } from './dto/publish-blog-post.dto';

@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequireFeature(WorkionFeature.BLOG)
@Controller('blog/posts')
export class BlogController {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly blogPostSettingsService: BlogPostSettingsService,
    private readonly shareService: ShareService,
    private readonly shareRepo: ShareRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly aiStreamService: AiStreamService,
  ) {}

  @Get('categories')
  async getCategories(
    @Query() { spaceId }: BlogCategoriesQueryDto,
    @AuthUser() user: User,
  ): Promise<string[]> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    return this.blogPostSettingsService.findCategories(spaceId);
  }

  @Get(':pageId/settings')
  async getSettings(
    @Param() { pageId }: BlogPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findEditableBlogPage(pageId, user, workspace.id);
    return this.blogPostSettingsService.findByPageId(page.id);
  }

  @Post(':pageId/settings')
  async saveSettings(
    @Param() { pageId }: BlogPageIdDto,
    @Body() dto: UpsertBlogPostSettingsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findEditableBlogPage(pageId, user, workspace.id);
    return this.blogPostSettingsService.upsert({
      pageId: page.id,
      spaceId: page.spaceId,
      title: page.title,
      ...dto,
    });
  }

  @Post(':pageId/publish')
  async publish(
    @Param() { pageId }: BlogPageIdDto,
    @Body() dto: PublishBlogPostDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findEditableBlogPage(pageId, user, workspace.id);
    const settings = await this.blogPostSettingsService.findByPageId(page.id);
    if (!settings?.slug) {
      throw new BadRequestException('Set a blog post slug before publishing');
    }

    return this.shareService.createShare({
      page,
      authUserId: user.id,
      workspaceId: workspace.id,
      createShareDto: {
        pageId: page.id,
        includeSubPages: false,
        searchIndexing: dto.robotsIndex ?? settings.robotsIndex,
      },
    });
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':pageId/unpublish')
  async unpublish(
    @Param() { pageId }: BlogPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findEditableBlogPage(pageId, user, workspace.id);
    const share = await this.shareRepo.findByPageId(page.id);
    if (share) await this.shareRepo.deleteShare(share.id);
  }

  @Post(':pageId/generate-seo')
  async generateSeo(
    @Param() { pageId }: BlogPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ tags: string[]; metaDescription: string }> {
    const page = await this.findEditableBlogPage(pageId, user, workspace.id, {
      includeTextContent: true,
    });

    const systemPrompt =
      'You are an SEO assistant for a blog. Given a post title and its content, ' +
      'produce: (1) "tags" — 3 to 6 concise, lowercase, relevant tags/keywords ' +
      'for the post; (2) "metaDescription" — an SEO-optimized meta description, ' +
      '140-160 characters, active voice, naturally including the primary topic, ' +
      'written to earn clicks without being clickbait. ' +
      'Respond with ONLY a raw JSON object of the exact shape ' +
      '{"tags": string[], "metaDescription": string} — no markdown fences, no ' +
      'explanation, no extra keys.';

    const userContent =
      `Title: ${page.title || 'Untitled'}\n\n` +
      `Content:\n${page.textContent?.trim() || '(empty page)'}`;

    const result = await this.aiStreamService.streamChat(
      workspace.id,
      [{ role: 'user', content: userContent }],
      systemPrompt,
    );

    let raw = '';
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        raw += part.text;
      } else if (part.type === 'error') {
        throw (part as any).error instanceof Error
          ? (part as any).error
          : new Error(String((part as any).error));
      }
    }

    return this.parseSeoResponse(raw);
  }

  private parseSeoResponse(raw: string): {
    tags: string[];
    metaDescription: string;
  } {
    const jsonText = raw
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new BadRequestException('AI returned an unexpected response');
    }

    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags
          .filter((tag: unknown) => typeof tag === 'string')
          .map((tag: string) => tag.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];
    const metaDescription =
      typeof parsed?.metaDescription === 'string'
        ? parsed.metaDescription.trim()
        : '';

    return { tags, metaDescription };
  }

  private async findEditableBlogPage(
    pageId: string,
    user: User,
    workspaceId: string,
    opts?: { includeTextContent?: boolean },
  ) {
    const page = await this.pageRepo.findById(pageId, opts);
    if (!page || page.workspaceId !== workspaceId || page.type !== 'blog') {
      throw new NotFoundException('Blog post not found');
    }
    await this.pageAccessService.validateCanEdit(page, user);
    return page;
  }
}
