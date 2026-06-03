import { Test } from '@nestjs/testing';
import { AiKeyService } from './ai-key.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const WORKSPACE_ID_B = '00000000-0000-0000-0000-000000000002';
const TEST_SECRET = 'test-secret-long-enough-for-scrypt-derivation';

function makeWorkspace(aiSettings: Record<string, any> = {}, id = WORKSPACE_ID) {
  return { id, settings: { ai: aiSettings } } as any;
}

describe('AiKeyService', () => {
  let service: AiKeyService;
  let workspaceRepo: jest.Mocked<Pick<WorkspaceRepo, 'findById' | 'updateAiSettings' | 'updateWorkspace'>>;
  let envService: jest.Mocked<Pick<EnvironmentService, 'getAppSecret'>>;

  beforeEach(async () => {
    workspaceRepo = {
      findById: jest.fn(),
      updateAiSettings: jest.fn().mockResolvedValue(makeWorkspace()),
      updateWorkspace: jest.fn().mockResolvedValue(makeWorkspace()),
    };

    envService = {
      getAppSecret: jest.fn().mockReturnValue(TEST_SECRET),
    };

    const module = await Test.createTestingModule({
      providers: [
        AiKeyService,
        { provide: WorkspaceRepo, useValue: workspaceRepo },
        { provide: EnvironmentService, useValue: envService },
      ],
    }).compile();

    service = module.get(AiKeyService);
  });

  describe('saveKey', () => {
    it('stores an encrypted value — not the plaintext key', async () => {
      await service.saveKey(WORKSPACE_ID, 'sk-or-v1-secret');

      const [, , storedValue] = workspaceRepo.updateAiSettings.mock.calls[0];
      expect(storedValue).not.toContain('sk-or-v1-secret');
      expect(typeof storedValue).toBe('string');
      expect((storedValue as string).length).toBeGreaterThan(0);
    });

    it('saves the provided model when supplied', async () => {
      await service.saveKey(WORKSPACE_ID, 'sk-or-v1-secret', 'anthropic/claude-3.5-sonnet');

      expect(workspaceRepo.updateAiSettings).toHaveBeenCalledWith(
        WORKSPACE_ID,
        'openrouterModel',
        'anthropic/claude-3.5-sonnet',
      );
    });

    it('defaults to openai/gpt-4o-mini when no model is provided', async () => {
      await service.saveKey(WORKSPACE_ID, 'sk-or-v1-secret');

      expect(workspaceRepo.updateAiSettings).toHaveBeenCalledWith(
        WORKSPACE_ID,
        'openrouterModel',
        'openai/gpt-4o-mini',
      );
    });
  });

  describe('getDecryptedKey', () => {
    it('returns null when no key is configured', async () => {
      workspaceRepo.findById.mockResolvedValue(makeWorkspace());

      const result = await service.getDecryptedKey(WORKSPACE_ID);

      expect(result).toBeNull();
    });

    it('round-trips: decrypts the value that saveKey encrypted', async () => {
      let capturedEncrypted: string;
      workspaceRepo.updateAiSettings.mockImplementation(async (_, key, value) => {
        if (key === 'openrouterKey') capturedEncrypted = value as string;
        return makeWorkspace();
      });

      await service.saveKey(WORKSPACE_ID, 'sk-or-v1-secret');

      workspaceRepo.findById.mockResolvedValue(
        makeWorkspace({ openrouterKey: capturedEncrypted }),
      );

      const result = await service.getDecryptedKey(WORKSPACE_ID);

      expect(result).toBe('sk-or-v1-secret');
    });

    it('throws when attempting to decrypt a key from a different workspace', async () => {
      let encryptedForA: string;
      workspaceRepo.updateAiSettings.mockImplementation(async (_, key, value) => {
        if (key === 'openrouterKey') encryptedForA = value as string;
        return makeWorkspace();
      });

      await service.saveKey(WORKSPACE_ID, 'sk-or-v1-secret');

      workspaceRepo.findById.mockResolvedValue(
        makeWorkspace({ openrouterKey: encryptedForA }, WORKSPACE_ID_B),
      );

      await expect(service.getDecryptedKey(WORKSPACE_ID_B)).rejects.toThrow();
    });
  });

  describe('getKeyStatus', () => {
    it('returns configured: false and default model when no key is set', async () => {
      workspaceRepo.findById.mockResolvedValue(makeWorkspace());

      const status = await service.getKeyStatus(WORKSPACE_ID);

      expect(status.configured).toBe(false);
      expect(status.model).toBe('openai/gpt-4o-mini');
    });

    it('returns configured: true when a key is stored', async () => {
      workspaceRepo.findById.mockResolvedValue(
        makeWorkspace({ openrouterKey: 'encrypted-blob' }),
      );

      const status = await service.getKeyStatus(WORKSPACE_ID);

      expect(status.configured).toBe(true);
    });

    it('returns the stored model name', async () => {
      workspaceRepo.findById.mockResolvedValue(
        makeWorkspace({
          openrouterKey: 'enc',
          openrouterModel: 'anthropic/claude-3.5-sonnet',
        }),
      );

      const status = await service.getKeyStatus(WORKSPACE_ID);

      expect(status.model).toBe('anthropic/claude-3.5-sonnet');
    });
  });

  describe('removeKey', () => {
    it('removes openrouterKey and openrouterModel from AI settings', async () => {
      workspaceRepo.findById.mockResolvedValue(
        makeWorkspace({ openrouterKey: 'enc', openrouterModel: 'openai/gpt-4o-mini', chat: true }),
      );

      await service.removeKey(WORKSPACE_ID);

      const [updatable] = workspaceRepo.updateWorkspace.mock.calls[0];
      const ai = (updatable.settings as any).ai;
      expect(ai.openrouterKey).toBeUndefined();
      expect(ai.openrouterModel).toBeUndefined();
    });

    it('preserves other AI settings when removing the key', async () => {
      workspaceRepo.findById.mockResolvedValue(
        makeWorkspace({ openrouterKey: 'enc', openrouterModel: 'openai/gpt-4o-mini', chat: true }),
      );

      await service.removeKey(WORKSPACE_ID);

      const [updatable] = workspaceRepo.updateWorkspace.mock.calls[0];
      const ai = (updatable.settings as any).ai;
      expect(ai.chat).toBe(true);
    });

    it('passes the correct workspaceId to updateWorkspace', async () => {
      workspaceRepo.findById.mockResolvedValue(makeWorkspace({ openrouterKey: 'enc' }));

      await service.removeKey(WORKSPACE_ID);

      expect(workspaceRepo.updateWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WORKSPACE_ID,
      );
    });
  });
});
