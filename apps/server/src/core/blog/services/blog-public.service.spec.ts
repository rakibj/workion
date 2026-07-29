import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BlogPostSettingsRepo } from '@docmost/db/repos/blog/blog-post-settings.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
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

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BlogPublicService,
        { provide: BlogPostSettingsRepo, useValue: repo },
        { provide: PagePermissionRepo, useValue: permissions },
      ],
    }).compile();
    service = module.get(BlogPublicService);
  });

  it('requires exactly one public-space selector', async () => {
    await expect(service.resolveSpace({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolveSpace({ domain: 'a.test', spaceId: 'space' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when a domain does not resolve', async () => {
    repo.findSpaceByBlogDomain.mockResolvedValue(undefined);
    await expect(service.getPost({ domain: 'missing.test' }, 'hello')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides unpublished or restricted posts', async () => {
    repo.findSpaceById.mockResolvedValue({ id: 'space' });
    repo.findPublishedBySlug.mockResolvedValue({ pageId: 'page' });
    permissions.hasRestrictedAncestor.mockResolvedValue(true);
    await expect(service.getPost({ spaceId: 'space' }, 'hello')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('paginates and excludes restricted posts from the result', async () => {
    repo.findSpaceById.mockResolvedValue({ id: 'space' });
    repo.listPublished.mockResolvedValue([
      { pageId: 'visible', title: 'Visible', slug: 'visible', robotsIndex: true, robotsFollow: true },
      { pageId: 'hidden', title: 'Hidden', slug: 'hidden', robotsIndex: true, robotsFollow: true },
    ]);
    permissions.hasRestrictedAncestor.mockImplementation((id) => Promise.resolve(id === 'hidden'));
    const result = await service.listPosts({ spaceId: 'space' }, 1, 1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].slug).toBe('visible');
    expect(result.meta.hasNextPage).toBe(true);
  });
});
