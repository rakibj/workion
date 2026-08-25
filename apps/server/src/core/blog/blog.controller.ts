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

  private async findEditableBlogPage(
    pageId: string,
    user: User,
    workspaceId: string,
  ) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspaceId || page.type !== 'blog') {
      throw new NotFoundException('Blog post not found');
    }
    await this.pageAccessService.validateCanEdit(page, user);
    return page;
  }
}
