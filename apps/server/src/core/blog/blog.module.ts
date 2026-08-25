import { Module } from '@nestjs/common';
import { BlogPostSettingsService } from './services/blog-post-settings.service';
import { BlogController } from './blog.controller';
import { BlogPublicController } from './blog-public.controller';
import { BlogRenderController } from './blog-render.controller';
import { BlogSeoController } from './blog-seo.controller';
import { BlogPublicService } from './services/blog-public.service';
import { PageAccessModule } from '../page/page-access/page-access.module';
import { ShareModule } from '../share/share.module';
import { AiChatModule } from '../ai-chat/ai-chat.module';

@Module({
  imports: [PageAccessModule, ShareModule, AiChatModule],
  providers: [BlogPostSettingsService, BlogPublicService],
  controllers: [
    BlogController,
    BlogPublicController,
    BlogRenderController,
    BlogSeoController,
  ],
  exports: [BlogPostSettingsService, BlogPublicService],
})
export class BlogModule {}
