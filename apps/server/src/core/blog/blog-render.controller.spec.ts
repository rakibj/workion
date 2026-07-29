import { BlogRenderController } from './blog-render.controller';

describe('BlogRenderController', () => {
  it('caches rendered HTML with the post update version and request origin', async () => {
    const blog = {
      resolveSpace: jest.fn().mockResolvedValue({ id: 'space-1' }),
      getPost: jest.fn().mockResolvedValue({
        id: 'post-1',
        slug: 'hello',
        title: 'Hello',
        html: '<p>Hello</p>',
        author: { name: 'Author' },
        publishedAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
        robotsIndex: true,
        robotsFollow: true,
      }),
    };
    const environment = {
      getAppUrl: jest.fn().mockReturnValue('https://workion.example'),
      isHttps: jest.fn().mockReturnValue(true),
    };
    const cache = {
      get: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ v: 'cached HTML' }),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new BlogRenderController(
      blog as any,
      environment as any,
      cache as any,
    );
    const render = jest.spyOn(controller as any, 'renderPost');
    const request = { url: '/hello', headers: { host: 'blog.example' } } as any;
    const firstReply = { type: jest.fn().mockReturnThis(), send: jest.fn() };
    const secondReply = { type: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.post('hello', request, firstReply as any);
    await controller.post('hello', request, secondReply as any);

    expect(render).toHaveBeenCalledTimes(1);
    expect(cache.set.mock.calls[0][0]).toContain('blog:render:post-1:');
    expect(cache.set.mock.calls[0][0]).toContain('https://blog.example');
    expect(secondReply.send).toHaveBeenCalledWith('cached HTML');
  });

  it('only renders a custom-domain post at its configured base path', async () => {
    const blog = {
      resolveSpace: jest
        .fn()
        .mockResolvedValue({
          id: 'space-1',
          settings: { blog: { basePath: '/blogs' } },
        }),
      getPost: jest.fn().mockResolvedValue({
        id: 'post-1',
        slug: 'hello',
        title: 'Hello',
        html: '<p>Hello</p>',
        author: { name: 'Author' },
        publishedAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
        robotsIndex: true,
        robotsFollow: true,
      }),
    };
    const environment = {
      getAppUrl: jest.fn().mockReturnValue('https://workion.example'),
      isHttps: jest.fn().mockReturnValue(true),
    };
    const controller = new BlogRenderController(
      blog as any,
      environment as any,
      { get: jest.fn(), set: jest.fn() } as any,
    );
    const sendIndex = jest
      .spyOn(controller as any, 'sendIndex')
      .mockReturnValue('spa');
    const reply = { type: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.post(
      'hello',
      { url: '/hello', headers: { host: 'blog.example' } } as any,
      reply as any,
    );
    expect(sendIndex).toHaveBeenCalled();
    expect(blog.getPost).not.toHaveBeenCalled();

    await controller.post(
      'hello',
      { url: '/blogs/hello', headers: { host: 'blog.example' } } as any,
      reply as any,
    );
    expect(blog.getPost).toHaveBeenCalledWith({ spaceId: 'space-1' }, 'hello');
  });
});
