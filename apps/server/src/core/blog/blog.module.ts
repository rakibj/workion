import { Module } from '@nestjs/common';
import { BlogPostSettingsService } from './services/blog-post-settings.service';

@Module({
  providers: [BlogPostSettingsService],
  exports: [BlogPostSettingsService],
})
export class BlogModule {}
