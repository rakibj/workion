import { BlogSeoController } from './blog-seo.controller';

describe('BlogSeoController', () => {
  const cache = { get: jest.fn(), set: jest.fn() };
  const blog = {
    resolveSpace: jest.fn(),
    listAllPosts: jest.fn(),
    listAllPrimaryPosts: jest.fn(),
  };
  const environment = { getAppUrl: jest.fn(), isHttps: jest.fn() };
  let controller: BlogSeoController;

  beforeEach(() => {
    jest.resetAllMocks();
    cache.get.mockResolvedValue(undefined);
    cache.set.mockResolvedValue(undefined);
    environment.getAppUrl.mockReturnValue('https://workion.example');
    environment.isHttps.mockReturnValue(true);
    controller = new BlogSeoController(
      blog as any,
      environment as any,
      cache as any,
    );
  });

  it('emits indexable posts only and caches the versioned sitemap', async () => {
    blog.resolveSpace.mockResolvedValue({ id: 'space-1' });
    blog.listAllPosts.mockResolvedValue([
      {
        id: 'post-1',
        slug: 'visible',
        robotsIndex: true,
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
      {
        id: 'post-2',
        slug: 'hidden',
        robotsIndex: false,
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
    ]);
    const reply = { type: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.sitemap(
      { url: '/sitemap.xml', headers: { host: 'blog.example' } } as any,
      reply as any,
    );

    expect(reply.type).toHaveBeenCalledWith('application/xml; charset=utf-8');
    expect(reply.send.mock.calls[0][0]).toContain(
      'https://blog.example/visible',
    );
    expect(reply.send.mock.calls[0][0]).not.toContain('hidden');
    expect(cache.set.mock.calls[0][0]).toContain(
      'blog:sitemap:space-1:post-1:',
    );
  });

  it('returns valid empty sitemap and RSS documents', async () => {
    blog.resolveSpace.mockResolvedValue({ id: 'space-1' });
    blog.listAllPosts.mockResolvedValue([]);
    const sitemapReply = { type: jest.fn().mockReturnThis(), send: jest.fn() };
    const rssReply = { type: jest.fn().mockReturnThis(), send: jest.fn() };
    const request = {
      url: '/sitemap.xml',
      headers: { host: 'blog.example' },
    } as any;

    await controller.sitemap(request, sitemapReply as any);
    await controller.rss({ ...request, url: '/rss.xml' }, rssReply as any);

    expect(sitemapReply.send.mock.calls[0][0]).toContain('<urlset');
    expect(rssReply.send.mock.calls[0][0]).toContain('<rss version="2.0">');
  });

  it("does not expose feeds outside a custom domain's configured base path", async () => {
    blog.resolveSpace.mockResolvedValue({
      id: 'space-1',
      settings: { blog: { basePath: '/blogs' } },
    });
    const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.sitemap(
      { url: '/sitemap.xml', headers: { host: 'blog.example' } } as any,
      reply as any,
    );

    expect(reply.code).toHaveBeenCalledWith(404);
    expect(blog.listAllPosts).not.toHaveBeenCalled();
  });

  it('uses an explicit selector baseUrl for public feed output', async () => {
    blog.resolveSpace.mockResolvedValue({
      id: 'space-1',
      settings: { blog: { basePath: '/ignored' } },
    });
    blog.listAllPosts.mockResolvedValue([
      {
        id: 'post-1',
        slug: 'hello',
        robotsIndex: true,
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
    ]);
    const reply = { type: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.publicSitemap(
      { spaceId: 'space-1', baseUrl: 'https://yoursite.example/blog' },
      reply as any,
    );

    expect(reply.send.mock.calls[0][0]).toContain(
      'https://yoursite.example/blog/hello',
    );
  });

  it('requires baseUrl for a selector when the blog has no domain', async () => {
    blog.resolveSpace.mockResolvedValue({
      id: 'space-1',
      settings: { blog: {} },
    });
    const reply = { type: jest.fn().mockReturnThis(), send: jest.fn() };

    await expect(
      controller.publicSitemap({ spaceId: 'space-1' }, reply as any),
    ).rejects.toThrow('baseUrl is required');
  });
});
