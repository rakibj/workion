import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { FastifyReply, FastifyRequest } from 'fastify';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { htmlEscape } from '../../common/helpers/html-escaper';
import { withCache } from '../../common/helpers/with-cache';
import { BlogPublicService } from './services/blog-public.service';

@Controller()
export class BlogRenderController {
  constructor(
    private readonly blogPublicService: BlogPublicService,
    private readonly environmentService: EnvironmentService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // Custom-domain requests are rewritten in main.ts's Fastify `rewriteUrl` onto the
  // '__blog-*' sentinel paths below before routing, since a bare single-segment
  // param route would otherwise collide with unrelated single-segment routes
  // elsewhere in the app (see the comment in main.ts). A single segment on a
  // custom domain is ambiguous between "the configured basePath" (archive) and
  // "a post slug at an empty basePath" — disambiguated here against the resolved
  // space's basePath.
  @Get(['blog', '__blog-root', '__blog-segment/:segment'])
  async archive(
    @Param('segment') segment: string | undefined,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const context = await this.resolveRequest(req);
    if (!context) return this.sendIndex(res);
    const rawPath = req.url.split('?')[0];
    const path = segment !== undefined ? `/${segment}` : rawPath === '/__blog-root' ? '' : rawPath;

    if (path === context.pathPrefix) {
      const data = context.primary
        ? await this.blogPublicService.listPrimaryPosts(1, 20)
        : await this.blogPublicService.listPosts(context.selector, 1, 20);
      return res.type('text/html').send(this.renderArchive(data.items, context.origin, context.pathPrefix));
    }

    if (!context.primary && context.pathPrefix === '' && segment !== undefined) {
      return this.sendPost(decodeURIComponent(segment), context, res);
    }

    return this.sendIndex(res);
  }

  @Get(['blog/:slug', '__blog-pair/:basePath/:slug'])
  async post(
    @Param('slug') slug: string,
    @Param('basePath') basePath: string | undefined,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const context = await this.resolveRequest(req);
    if (!context) return this.sendIndex(res);
    const requestedPrefix = context.primary ? '/blog' : `/${basePath}`;
    if (requestedPrefix !== context.pathPrefix) return this.sendIndex(res);
    return this.sendPost(slug, context, res);
  }

  private async sendPost(
    slug: string,
    context: { selector: Record<string, unknown>; origin: string; primary: boolean; pathPrefix: string },
    res: FastifyReply,
  ) {
    const post = context.primary
      ? await this.blogPublicService.getPrimaryPost(slug)
      : await this.blogPublicService.getPost(context.selector, slug);
    const html = await withCache(
      this.cacheManager,
      `blog:render:${post.id}:${new Date(post.updatedAt).getTime()}:${context.origin}${context.pathPrefix}`,
      60 * 60 * 1000,
      async () => this.renderPost(post, context.origin, context.pathPrefix),
    );
    return res.type('text/html').send(html);
  }

  private async resolveRequest(req: FastifyRequest) {
    const host = (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
    const primaryHost = new URL(this.environmentService.getAppUrl()).hostname.toLowerCase();
    const isPrimary = host === primaryHost || !host;

    if (isPrimary) {
      if (!req.url.split('?')[0].startsWith('/blog')) return null;
      return { selector: {}, origin: this.origin(req), primary: true, pathPrefix: '/blog' };
    }

    try {
      const space = await this.blogPublicService.resolveSpace({ domain: host });
      return {
        selector: { spaceId: space.id },
        origin: this.origin(req),
        primary: false,
        pathPrefix: this.basePath(space),
      };
    } catch {
      return null;
    }
  }

  private origin(req: FastifyRequest) {
    const protocol = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]
      ?? (this.environmentService.isHttps() ? 'https' : 'http');
    return `${protocol}://${req.headers.host}`;
  }

  private basePath(space: any) {
    return space.settings?.blog?.basePath || '';
  }

  private renderArchive(posts: any[], origin: string, pathPrefix: string) {
    const cards = posts
      .map(
        (post) => `<article><h2><a href="${pathPrefix}/${encodeURIComponent(post.slug)}">${htmlEscape(post.title)}</a></h2><p>${htmlEscape(post.metaDescription ?? '')}</p></article>`,
      )
      .join('');
    return this.document({
      title: 'Blog',
      description: 'Blog posts',
      canonical: `${origin}${pathPrefix || '/'}`,
      body: `<main><h1>Blog</h1>${cards || '<p>No posts yet.</p>'}</main>`,
    });
  }

  private renderPost(post: any, origin: string, pathPrefix: string) {
    const title = post.metaTitle || post.title;
    const canonical = post.canonicalUrl || `${origin}${pathPrefix}/${encodeURIComponent(post.slug)}`;
    const structuredData = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: title,
      author: { '@type': 'Person', name: post.author.name },
      datePublished: new Date(post.publishedAt).toISOString(),
      dateModified: new Date(post.updatedAt).toISOString(),
      mainEntityOfPage: canonical,
    }).replace(/</g, '\\u003c');
    return this.document({
      title,
      description: post.metaDescription,
      canonical,
      robots: `${post.robotsIndex ? 'index' : 'noindex'},${post.robotsFollow ? 'follow' : 'nofollow'}`,
      ogImage: post.ogImageAttachmentId,
      structuredData,
      body: `<main><article><h1>${htmlEscape(post.title)}</h1>${post.html}</article></main>`,
    });
  }

  private document(opts: {
    title: string;
    description?: string;
    canonical: string;
    robots?: string;
    ogImage?: string;
    structuredData?: string;
    body: string;
  }) {
    const title = htmlEscape(opts.title);
    const description = opts.description ? htmlEscape(opts.description) : '';
    const canonical = htmlEscape(opts.canonical);
    const image = opts.ogImage ? htmlEscape(opts.ogImage) : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="canonical" href="${canonical}">${description ? `<meta name="description" content="${description}">` : ''}<meta property="og:title" content="${title}">${description ? `<meta property="og:description" content="${description}">` : ''}${image ? `<meta property="og:image" content="${image}">` : ''}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}">${description ? `<meta name="twitter:description" content="${description}">` : ''}${opts.robots ? `<meta name="robots" content="${opts.robots}">` : ''}${opts.structuredData ? `<script type="application/ld+json">${opts.structuredData}</script>` : ''}<style>body{font:18px/1.65 system-ui,sans-serif;color:#1f2937;margin:0}main{max-width:760px;margin:64px auto;padding:0 24px}h1,h2{line-height:1.2}a{color:#2563eb;text-decoration:none}article{margin:0 0 48px}img{max-width:100%;height:auto}</style></head><body>${opts.body}</body></html>`;
  }

  private sendIndex(res: FastifyReply) {
    const indexPath = join(__dirname, '..', '..', '..', '..', 'client/dist/index.html');
    if (!fs.existsSync(indexPath)) return res.code(404).send();
    return res.type('text/html').send(fs.createReadStream(indexPath));
  }
}
