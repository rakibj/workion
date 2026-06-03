import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkspaceAiController } from './workspace-ai.controller';
import { AiKeyService } from '../services/ai-key.service';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { UserRole } from '../../../common/helpers/types/permission';
import { User, Workspace } from '@docmost/db/types/entity.types';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

const adminUser = { id: 'u1', role: UserRole.ADMIN } as User;
const ownerUser = { id: 'u2', role: UserRole.OWNER } as User;
const memberUser = { id: 'u3', role: UserRole.MEMBER } as User;
const workspace = { id: WORKSPACE_ID } as Workspace;

describe('WorkspaceAiController', () => {
  let controller: WorkspaceAiController;
  let aiKeyService: jest.Mocked<
    Pick<AiKeyService, 'saveKey' | 'removeKey' | 'getKeyStatus'>
  >;

  beforeEach(async () => {
    aiKeyService = {
      saveKey: jest.fn().mockResolvedValue(undefined),
      removeKey: jest.fn().mockResolvedValue(undefined),
      getKeyStatus: jest
        .fn()
        .mockResolvedValue({ configured: true, model: 'openai/gpt-4o-mini' }),
    };

    const module = await Test.createTestingModule({
      controllers: [WorkspaceAiController],
      providers: [
        { provide: AiKeyService, useValue: aiKeyService },
        WorkspaceAbilityFactory,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(WorkspaceAiController);
  });

  describe('saveKey (POST /workspace/ai/key)', () => {
    it('saves the key when called by an admin', async () => {
      await controller.saveKey(
        { apiKey: 'sk-or-test', model: 'openai/gpt-4o-mini' },
        adminUser,
        workspace,
      );

      expect(aiKeyService.saveKey).toHaveBeenCalledWith(
        WORKSPACE_ID,
        'sk-or-test',
        'openai/gpt-4o-mini',
      );
    });

    it('saves the key when called by an owner', async () => {
      await controller.saveKey({ apiKey: 'sk-or-test' }, ownerUser, workspace);

      expect(aiKeyService.saveKey).toHaveBeenCalledWith(
        WORKSPACE_ID,
        'sk-or-test',
        undefined,
      );
    });

    it('throws ForbiddenException for a member', async () => {
      await expect(
        controller.saveKey({ apiKey: 'sk-or-test' }, memberUser, workspace),
      ).rejects.toThrow(ForbiddenException);

      expect(aiKeyService.saveKey).not.toHaveBeenCalled();
    });
  });

  describe('removeKey (DELETE /workspace/ai/key)', () => {
    it('removes the key when called by an admin', async () => {
      await controller.removeKey(adminUser, workspace);

      expect(aiKeyService.removeKey).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('removes the key when called by an owner', async () => {
      await controller.removeKey(ownerUser, workspace);

      expect(aiKeyService.removeKey).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('throws ForbiddenException for a member', async () => {
      await expect(
        controller.removeKey(memberUser, workspace),
      ).rejects.toThrow(ForbiddenException);

      expect(aiKeyService.removeKey).not.toHaveBeenCalled();
    });
  });

  describe('getKeyStatus (GET /workspace/ai/key/status)', () => {
    it('returns key status for an admin', async () => {
      const result = await controller.getKeyStatus(adminUser, workspace);

      expect(result).toEqual({ configured: true, model: 'openai/gpt-4o-mini' });
      expect(aiKeyService.getKeyStatus).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('returns key status for an owner', async () => {
      const result = await controller.getKeyStatus(ownerUser, workspace);

      expect(result).toEqual({ configured: true, model: 'openai/gpt-4o-mini' });
    });

    it('throws ForbiddenException for a member', async () => {
      await expect(
        controller.getKeyStatus(memberUser, workspace),
      ).rejects.toThrow(ForbiddenException);

      expect(aiKeyService.getKeyStatus).not.toHaveBeenCalled();
    });
  });
});
