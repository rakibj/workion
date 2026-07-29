import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ListPublicBlogPostsDto, PublicBlogSelectorDto } from './dto/public-blog.dto';
import { BlogPublicService } from './services/blog-public.service';

@Public()
@Controller('public/blog')
export class BlogPublicController {
  constructor(private readonly blogPublicService: BlogPublicService) {}

  @Get('posts')
  list(@Query() query: ListPublicBlogPostsDto) {
    return this.blogPublicService.listPosts(query, query.page, query.limit);
  }

  @Get('posts/:slug')
  get(@Param('slug') slug: string, @Query() query: PublicBlogSelectorDto) {
    return this.blogPublicService.getPost(query, slug);
  }
}
