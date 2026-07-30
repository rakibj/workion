import { Readable } from 'stream';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { getQueueToken } from '@nestjs/bullmq';
import { AttachmentService } from './attachment.service';
import { StorageService } from '../../../integrations/storage/storage.service';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { QueueName } from '../../../integrations/queue/constants';

function makeFilePromise(filename: string, sizeBytes: number): Promise<any> {
  const buffer = Buffer.alloc(sizeBytes, 'a');
  return Promise.resolve({
    filename,
    file: Readable.from(buffer),
  });
}

describe('AttachmentService.uploadFile — GIF size cap', () => {
  let service: AttachmentService;
  let storageService: jest.Mocked<Partial<StorageService>>;
  let attachmentRepo: jest.Mocked<Partial<AttachmentRepo>>;

  const userId = '00000000-0000-0000-0000-000000000001';
  const spaceId = '00000000-0000-0000-0000-000000000002';
  const workspaceId = '00000000-0000-0000-0000-000000000003';
  const pageId = '00000000-0000-0000-0000-000000000004';

  beforeEach(async () => {
    storageService = {
      upload: jest.fn(async (_path: string, content: any) => {
        // Drain the stream the same way a real storage backend would,
        // so createByteCountingStream's byte counter reflects the full body.
        if (content instanceof Readable) {
          for await (const _chunk of content) {
            // no-op
          }
        }
      }),
      delete: jest.fn(),
    };
    attachmentRepo = {
      insertAttachment: jest
        .fn()
        .mockResolvedValue({ id: 'attachment-id', fileExt: '.gif' }),
      deleteAttachmentByFilePath: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AttachmentService,
        { provide: StorageService, useValue: storageService },
        { provide: AttachmentRepo, useValue: attachmentRepo },
        { provide: UserRepo, useValue: {} },
        { provide: WorkspaceRepo, useValue: {} },
        { provide: SpaceRepo, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: getQueueToken(QueueName.ATTACHMENT_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(AttachmentService);
  });

  it('uploads a GIF under the 5MB cap', async () => {
    const result = await service.uploadFile({
      filePromise: makeFilePromise('party.gif', 4 * 1024 * 1024),
      pageId,
      userId,
      spaceId,
      workspaceId,
    });

    expect(result).toEqual({ id: 'attachment-id', fileExt: '.gif' });
    expect(attachmentRepo.insertAttachment).toHaveBeenCalled();
  });

  it('rejects a GIF over the 5MB cap', async () => {
    await expect(
      service.uploadFile({
        filePromise: makeFilePromise('huge.gif', 6 * 1024 * 1024),
        pageId,
        userId,
        spaceId,
        workspaceId,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(attachmentRepo.insertAttachment).not.toHaveBeenCalled();
  });

  it('still uploads a non-GIF image over 5MB (proves the cap is GIF-specific)', async () => {
    const result = await service.uploadFile({
      filePromise: makeFilePromise('photo.jpg', 6 * 1024 * 1024),
      pageId,
      userId,
      spaceId,
      workspaceId,
    });

    expect(result).toEqual({ id: 'attachment-id', fileExt: '.gif' });
    expect(attachmentRepo.insertAttachment).toHaveBeenCalled();
  });
});
