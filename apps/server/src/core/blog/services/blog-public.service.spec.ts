import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BlogPostSettingsRepo } from '@docmost/db/repos/blog/blog-post-settings.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { TokenService } from '../../auth/services/token.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { BlogPublicService } from './blog-public.service';

describe('BlogPublicService', () => {
  let service: BlogPublicService;
  const repo = {
    findSpaceByBlogDomain: jest.fn(),
    findSpaceById: jest.fn(),
    findPublishedBySlug: jest.fn(),
    listPublished: jest.fn(),
  };
  const permissions = { hasRestrictedAncestor: jest.fn() };
  const attachments = { findById: jest.fn() };
  const tokens = { generateAttachmentToken: jest.fn() };
  const environment = { getAppUrl: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    environment.getAppUrl.mockReturnValue('https://workion.example');
    const module = await Test.createTestingModule({
      providers: [
        BlogPublicService,
        { provide: BlogPostSettingsRepo, useValue: repo },
        { provide: PagePermissionRepo, useValue: permissions },
        { provide: AttachmentRepo, useValue: attachments },
        { provide: TokenService, useValue: tokens },
        { provide: EnvironmentService, useValue: environment },
      ],
    }).compile();
    service = module.get(BlogPublicService);
  });

  it('rewrites inline attachments and supplies public OG and SEO metadata', async () => {
    repo.findSpaceById.mockResolvedValue({
      id: 'space',
      workspaceId: 'workspace',
      settings: { blog: { domain: 'blog.example', basePath: '/news' } },
    });
    repo.findPublishedBySlug.mockResolvedValue({
      pageId: 'page',
      title: 'Hello',
      slug: 'hello',
      content: {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              attachmentId: '123e4567-e89b-12d3-a456-426614174000',
              src: '/api/files/123e4567-e89b-12d3-a456-426614174000/image.png',
            },
          },
        ],
      },
      ogImageAttachmentId: '123e4567-e89b-12d3-a456-426614174000',
      robotsIndex: true,
      robotsFollow: false,
      publishedAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
      authorName: 'Author',
    });
    permissions.hasRestrictedAncestor.mockResolvedValue(false);
    tokens.generateAttachmentToken.mockResolvedValue('signed-token');
    attachments.findById.mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      fileName: 'cover image.png',
      workspaceId: 'workspace',
    });

    const post = await service.getPost({ spaceId: 'space' }, 'hello');

    expect(post.html).toContain(
      'https://workion.example/api/files/public/123e4567-e89b-12d3-a456-426614174000/image.png?jwt=signed-token',
    );
    expect(post.ogImageUrl).toBe(
      'https://blog.example/api/files/public/123e4567-e89b-12d3-a456-426614174000/cover%20image.png?jwt=signed-token',
    );
    expect(post.meta).toMatchObject({
      canonical: 'https://blog.example/news/hello',
      robots: 'index,nofollow',
    });
  });

  it('requires exactly one public-space selector', async () => {
    await expect(service.resolveSpace({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.resolveSpace({ domain: 'a.test', spaceId: 'space' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when a domain does not resolve', async () => {
    repo.findSpaceByBlogDomain.mockResolvedValue(undefined);
    await expect(
      service.getPost({ domain: 'missing.test' }, 'hello'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides unpublished or restricted posts', async () => {
    repo.findSpaceById.mockResolvedValue({ id: 'space' });
    repo.findPublishedBySlug.mockResolvedValue({ pageId: 'page' });
    permissions.hasRestrictedAncestor.mockResolvedValue(true);
    await expect(
      service.getPost({ spaceId: 'space' }, 'hello'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('paginates and excludes restricted posts from the result', async () => {
    repo.findSpaceById.mockResolvedValue({ id: 'space' });
    repo.listPublished.mockResolvedValue([
      {
        pageId: 'visible',
        title: 'Visible',
        slug: 'visible',
        robotsIndex: true,
        robotsFollow: true,
        publishedAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
      {
        pageId: 'hidden',
        title: 'Hidden',
        slug: 'hidden',
        robotsIndex: true,
        robotsFollow: true,
        publishedAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
    ]);
    permissions.hasRestrictedAncestor.mockImplementation((id) =>
      Promise.resolve(id === 'hidden'),
    );
    const result = await service.listPosts({ spaceId: 'space' }, 1, 1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].slug).toBe('visible');
    expect(result.meta.hasNextPage).toBe(true);
  });
});
