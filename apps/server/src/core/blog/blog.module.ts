import { Module } from '@nestjs/common';
import { BlogPostSettingsService } from './services/blog-post-settings.service';
import { BlogController } from './blog.controller';
import { PageAccessModule } from '../page/page-access/page-access.module';
import { ShareModule } from '../share/share.module';

@Module({
  imports: [PageAccessModule, ShareModule],
  providers: [BlogPostSettingsService],
  controllers: [BlogController],
  exports: [BlogPostSettingsService],
})
export class BlogModule {}
