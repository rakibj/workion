import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { SpaceService } from './space.service';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberService } from './space-member.service';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { QueueName } from '../../../integrations/queue/constants';
import { AUDIT_SERVICE } from '../../../integrations/audit/audit.service';
import { BlogCustomFieldType } from '../dto/update-space-blog-settings.dto';

describe('SpaceService', () => {
  let service: SpaceService;
  let spaceRepo: jest.Mocked<Partial<SpaceRepo>>;

  const spaceId = '00000000-0000-0000-0000-000000000001';
  const workspaceId = '00000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    spaceRepo = {
      findById: jest.fn(),
      updateBlogSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpaceService,
        { provide: SpaceRepo, useValue: spaceRepo },
        { provide: SpaceMemberService, useValue: {} },
        { provide: SpaceMemberRepo, useValue: {} },
        { provide: ShareRepo, useValue: {} },
        {
          provide: KYSELY_MODULE_CONNECTION_TOKEN(undefined),
          useValue: {},
        },
        { provide: getQueueToken(QueueName.ATTACHMENT_QUEUE), useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<SpaceService>(SpaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateBlogSettings', () => {
    it('throws when the space does not exist', async () => {
      (spaceRepo.findById as jest.Mock).mockResolvedValue(undefined);

      await expect(
        service.updateBlogSettings(spaceId, workspaceId, 'example.com'),
      ).rejects.toThrow(NotFoundException);
      expect(spaceRepo.updateBlogSettings).not.toHaveBeenCalled();
    });

    it('does not include customFields in the merge when omitted', async () => {
      (spaceRepo.findById as jest.Mock).mockResolvedValue({ id: spaceId });

      await service.updateBlogSettings(spaceId, workspaceId, 'example.com', '/blogs');

      expect(spaceRepo.updateBlogSettings).toHaveBeenCalledWith(
        spaceId,
        workspaceId,
        { domain: 'example.com', basePath: '/blogs' },
      );
    });

    it('rejects duplicate custom field keys', async () => {
      (spaceRepo.findById as jest.Mock).mockResolvedValue({ id: spaceId });

      await expect(
        service.updateBlogSettings(spaceId, workspaceId, 'example.com', undefined, [
          { key: 'isFeatured', label: 'Featured', type: BlogCustomFieldType.BOOLEAN },
          { key: 'isFeatured', label: 'Featured again', type: BlogCustomFieldType.TEXT },
        ]),
      ).rejects.toThrow(BadRequestException);
      expect(spaceRepo.updateBlogSettings).not.toHaveBeenCalled();
    });

    it('passes a valid custom field schema through to the repo', async () => {
      (spaceRepo.findById as jest.Mock).mockResolvedValue({ id: spaceId });
      const customFields = [
        { key: 'isFeatured', label: 'Featured', type: BlogCustomFieldType.BOOLEAN },
        { key: 'priority', label: 'Priority', type: BlogCustomFieldType.NUMBER },
      ];

      await service.updateBlogSettings(
        spaceId,
        workspaceId,
        'example.com',
        undefined,
        customFields,
      );

      expect(spaceRepo.updateBlogSettings).toHaveBeenCalledWith(
        spaceId,
        workspaceId,
        { domain: 'example.com', basePath: '', customFields },
      );
    });
  });
});
