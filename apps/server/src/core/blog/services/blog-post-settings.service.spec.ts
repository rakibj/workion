import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { BlogPostSettingsRepo } from '@docmost/db/repos/blog/blog-post-settings.repo';
import { BlogPostSettingsService } from './blog-post-settings.service';
import { BlogCustomFieldType } from '../../space/dto/update-space-blog-settings.dto';

describe('BlogPostSettingsService', () => {
  let service: BlogPostSettingsService;
  let repo: jest.Mocked<BlogPostSettingsRepo>;

  const pageId = '00000000-0000-0000-0000-000000000001';
  const spaceId = '00000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    const repoMock: jest.Mocked<Partial<BlogPostSettingsRepo>> = {
      findBySlugInSpace: jest.fn(),
      upsert: jest.fn(),
      findSpaceById: jest.fn(),
      findDistinctCategories: jest.fn(),
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

  describe('tags', () => {
    beforeEach(() => {
      repo.findBySlugInSpace.mockResolvedValue(undefined);
      repo.upsert.mockResolvedValue({ pageId, spaceId, slug: 'hello-world' } as any);
    });

    it('trims whitespace and drops empty tags', async () => {
      await service.upsert({
        pageId,
        spaceId,
        title: 'Hello World',
        tags: ['  react ', '', '   ', 'typescript'],
      });

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['react', 'typescript'] }),
      );
    });

    it('leaves tags undefined when none are supplied', async () => {
      await service.upsert({ pageId, spaceId, title: 'Hello World' });

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tags: undefined }),
      );
    });
  });

  describe('findCategories', () => {
    it('delegates to the repo for the given space', async () => {
      repo.findDistinctCategories.mockResolvedValue(['News', 'Tutorials']);

      const result = await service.findCategories(spaceId);

      expect(repo.findDistinctCategories).toHaveBeenCalledWith(spaceId);
      expect(result).toEqual(['News', 'Tutorials']);
    });
  });

  describe('customFields validation', () => {
    beforeEach(() => {
      repo.findBySlugInSpace.mockResolvedValue(undefined);
      repo.upsert.mockResolvedValue({ pageId, spaceId, slug: 'hello-world' } as any);
      repo.findSpaceById.mockResolvedValue({
        id: spaceId,
        settings: {
          blog: {
            customFields: [
              { key: 'isFeatured', label: 'Featured', type: BlogCustomFieldType.BOOLEAN },
              { key: 'priority', label: 'Priority', type: BlogCustomFieldType.NUMBER },
            ],
          },
        },
      } as any);
    });

    it('rejects a custom field key that is not in the space schema', async () => {
      await expect(
        service.upsert({
          pageId,
          spaceId,
          title: 'Hello World',
          customFields: { notInSchema: true },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a value whose type does not match the schema', async () => {
      await expect(
        service.upsert({
          pageId,
          spaceId,
          title: 'Hello World',
          customFields: { isFeatured: 'yes' as any },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('accepts values matching the space schema', async () => {
      await service.upsert({
        pageId,
        spaceId,
        title: 'Hello World',
        customFields: { isFeatured: true, priority: 3 },
      });

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          customFields: { isFeatured: true, priority: 3 },
        }),
      );
    });
  });
});
