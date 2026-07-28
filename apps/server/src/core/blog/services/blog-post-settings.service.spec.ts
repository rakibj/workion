import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { BlogPostSettingsRepo } from '@docmost/db/repos/blog/blog-post-settings.repo';
import { BlogPostSettingsService } from './blog-post-settings.service';

describe('BlogPostSettingsService', () => {
  let service: BlogPostSettingsService;
  let repo: jest.Mocked<BlogPostSettingsRepo>;

  const pageId = '00000000-0000-0000-0000-000000000001';
  const spaceId = '00000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    const repoMock: jest.Mocked<Partial<BlogPostSettingsRepo>> = {
      findBySlugInSpace: jest.fn(),
      upsert: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        BlogPostSettingsService,
        { provide: BlogPostSettingsRepo, useValue: repoMock },
      ],
    }).compile();

    service = module.get(BlogPostSettingsService);
    repo = module.get(
      BlogPostSettingsRepo,
    ) as jest.Mocked<BlogPostSettingsRepo>;
  });

  it('generates a slug from the page title when none is supplied', async () => {
    repo.findBySlugInSpace.mockResolvedValue(undefined);
    repo.upsert.mockResolvedValue({
      pageId,
      spaceId,
      slug: 'hello-world',
    } as any);

    await service.upsert({ pageId, spaceId, title: 'Hello, World!' });

    expect(repo.findBySlugInSpace).toHaveBeenCalledWith(spaceId, 'hello-world');
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pageId, spaceId, slug: 'hello-world' }),
    );
  });

  it('throws when a different post already uses the slug in the same space', async () => {
    repo.findBySlugInSpace.mockResolvedValue({
      pageId: '00000000-0000-0000-0000-000000000003',
      spaceId,
      slug: 'hello-world',
    } as any);

    await expect(
      service.upsert({ pageId, spaceId, title: 'Hello World' }),
    ).rejects.toThrow(ConflictException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('checks slug collisions only within the target space', async () => {
    repo.findBySlugInSpace.mockResolvedValue(undefined);
    repo.upsert.mockResolvedValue({
      pageId,
      spaceId,
      slug: 'hello-world',
    } as any);

    await service.upsert({ pageId, spaceId, title: 'Hello World' });

    expect(repo.findBySlugInSpace).toHaveBeenCalledWith(spaceId, 'hello-world');
  });
});
