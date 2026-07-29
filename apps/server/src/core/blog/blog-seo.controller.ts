import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { withCache } from '../../common/helpers/with-cache';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { BlogPublicService } from './services/blog-public.service';

@Controller()
export class BlogSeoController {
  constructor(
    private readonly blogPublicService: BlogPublicService,
    private readonly environmentService: EnvironmentService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  @SkipTransform()
  @Get(['sitemap.xml', ':basePath/sitemap.xml'])
  async sitemap(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const context = await this.resolveRequest(req);
    if (!this.matchesPath(req, context.pathPrefix, 'sitemap.xml'))
      return res.code(404).send();
    const posts = await this.listPosts(context);
    const indexable = posts.filter((post) => post.robotsIndex);
    const version =
      indexable
        .map((post) => `${post.id}:${new Date(post.updatedAt).getTime()}`)
        .join('|') || 'empty';
    const xml = await withCache(
      this.cacheManager,
      `blog:sitemap:${context.key}:${version}`,
      60 * 60 * 1000,
      async () =>
        this.sitemapXml(indexable, context.origin, context.pathPrefix),
    );
    return res.type('application/xml; charset=utf-8').send(xml);
  }

  @SkipTransform()
  @Get(['rss.xml', ':basePath/rss.xml'])
  async rss(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const context = await this.resolveRequest(req);
    if (!this.matchesPath(req, context.pathPrefix, 'rss.xml'))
      return res.code(404).send();
    const posts = await this.listPosts(context);
    return res
      .type('application/rss+xml; charset=utf-8')
      .send(this.rssXml(posts, context.origin, context.pathPrefix));
  }

  @SkipTransform()
  @Get(['robots.txt', ':basePath/robots.txt'])
  async robots(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const context = await this.resolveRequest(req);
    if (!this.matchesPath(req, context.pathPrefix, 'robots.txt'))
      return res.code(404).send();
    return res
      .type('text/plain; charset=utf-8')
      .send(
        `User-agent: *\nAllow: /\nSitemap: ${context.origin}${context.pathPrefix}/sitemap.xml\n`,
      );
  }

  private async resolveRequest(req: FastifyRequest) {
    const host = (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
    const primaryHost = new URL(
      this.environmentService.getAppUrl(),
    ).hostname.toLowerCase();
    const origin = this.origin(req);
    if (host === primaryHost || !host)
      return { primary: true, key: 'primary', origin, pathPrefix: '/blog' };
    const space = await this.blogPublicService.resolveSpace({ domain: host });
    return {
      primary: false,
      key: space.id,
      origin,
      pathPrefix: (space.settings as any)?.blog?.basePath || '',
    };
  }

  private async listPosts(context: { primary: boolean; key: string }) {
    const result = context.primary
      ? await this.blogPublicService.listAllPrimaryPosts()
      : await this.blogPublicService.listAllPosts({ spaceId: context.key });
    return result;
  }

  private origin(req: FastifyRequest) {
    const protocol =
      (req.headers['x-forwarded-proto'] as string)?.split(',')[0] ??
      (this.environmentService.isHttps() ? 'https' : 'http');
    return `${protocol}://${req.headers.host}`;
  }

  private matchesPath(
    req: FastifyRequest,
    pathPrefix: string,
    filename: string,
  ) {
    const path = req.url.split('?')[0].replace(/\/$/, '');
    return path === `${pathPrefix}/${filename}`;
  }

  private sitemapXml(posts: any[], origin: string, pathPrefix: string) {
    const urls = posts
      .map(
        (post) =>
          `<url><loc>${xmlEscape(this.url(origin, pathPrefix, post.slug))}</loc><lastmod>${new Date(post.updatedAt).toISOString()}</lastmod></url>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  }

  private rssXml(posts: any[], origin: string, pathPrefix: string) {
    const items = posts
      .map(
        (post) =>
          `<item><title>${xmlEscape(post.title)}</title><link>${xmlEscape(this.url(origin, pathPrefix, post.slug))}</link><guid>${xmlEscape(this.url(origin, pathPrefix, post.slug))}</guid><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>${post.metaDescription ? `<description>${xmlEscape(post.metaDescription)}</description>` : ''}</item>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog</title><link>${xmlEscape(`${origin}${pathPrefix || '/'}`)}</link><description>Blog posts</description>${items}</channel></rss>`;
  }

  private url(origin: string, pathPrefix: string, slug: string) {
    return `${origin}${pathPrefix}/${encodeURIComponent(slug)}`;
  }
}

function xmlEscape(value: string) {
  return value.replace(
    /[<>&'\"]/g,
    (char) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[char]!,
  );
}
