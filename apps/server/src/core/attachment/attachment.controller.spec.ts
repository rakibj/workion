import { NotFoundException } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';

describe('AttachmentController - getBlogFile', () => {
  const attachmentRepo = { findById: jest.fn() };
  const blogPostSettingsRepo = { isPublished: jest.fn() };
  const pagePermissionRepo = { hasRestrictedAncestor: jest.fn() };
  const storageService = { readStream: jest.fn(), readRangeStream: jest.fn() };

  const buildController = () =>
    new AttachmentController(
      {} as any, // attachmentService
      storageService as any,
      {} as any, // workspaceAbility
      {} as any, // spaceAbility
      {} as any, // pageRepo
      attachmentRepo as any,
      {} as any, // environmentService
      {} as any, // tokenService
      {} as any, // pageAccessService
      blogPostSettingsRepo as any,
      pagePermissionRepo as any,
      {} as any, // auditService
    );

  const buildRes = () => ({
    header: jest.fn(),
    headers: jest.fn(),
    status: jest.fn(),
    send: jest.fn(),
  });

  const validFileId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => jest.resetAllMocks());

  it('serves the file with an immutable cache header for a published, unrestricted post', async () => {
    attachmentRepo.findById.mockResolvedValue({
      id: validFileId,
      pageId: 'page-1',
      fileName: 'cover.png',
      fileExt: '.png',
      mimeType: 'image/png',
      fileSize: 100,
      filePath: 'path/to/file',
    });
    blogPostSettingsRepo.isPublished.mockResolvedValue(true);
    pagePermissionRepo.hasRestrictedAncestor.mockResolvedValue(false);
    storageService.readStream.mockResolvedValue('stream');

    const res = buildRes();
    await buildController().getBlogFile(
      { headers: {} } as any,
      res as any,
      validFileId,
      'cover.png',
    );

    expect(blogPostSettingsRepo.isPublished).toHaveBeenCalledWith('page-1');
    expect(res.headers).toHaveBeenCalledWith(
      expect.objectContaining({
        'Cache-Control': 'public, max-age=31536000, immutable',
      }),
    );
    expect(res.send).toHaveBeenCalledWith('stream');
  });

  it('404s when the attachment page has no active published blog post', async () => {
    attachmentRepo.findById.mockResolvedValue({
      id: validFileId,
      pageId: 'page-1',
    });
    blogPostSettingsRepo.isPublished.mockResolvedValue(false);
    pagePermissionRepo.hasRestrictedAncestor.mockResolvedValue(false);

    await expect(
      buildController().getBlogFile(
        {} as any,
        buildRes() as any,
        validFileId,
        'cover.png',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when an ancestor is restricted even if the post is published', async () => {
    attachmentRepo.findById.mockResolvedValue({
      id: validFileId,
      pageId: 'page-1',
    });
    blogPostSettingsRepo.isPublished.mockResolvedValue(true);
    pagePermissionRepo.hasRestrictedAncestor.mockResolvedValue(true);

    await expect(
      buildController().getBlogFile(
        {} as any,
        buildRes() as any,
        validFileId,
        'cover.png',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s for a malformed file id without querying the database', async () => {
    await expect(
      buildController().getBlogFile(
        {} as any,
        buildRes() as any,
        'not-a-uuid',
        'cover.png',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(attachmentRepo.findById).not.toHaveBeenCalled();
  });
});
