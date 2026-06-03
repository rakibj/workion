import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}));

jest.mock('ai', () => ({
  streamText: jest.fn(),
}));

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, ModelMessage } from 'ai';
import { AiStreamService } from './ai-stream.service';
import { AiKeyService } from './ai-key.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

describe('AiStreamService', () => {
  let service: AiStreamService;
  let aiKeyService: jest.Mocked<Pick<AiKeyService, 'getDecryptedKey' | 'getKeyStatus'>>;
  let mockProviderFn: jest.Mock;

  beforeEach(async () => {
    mockProviderFn = jest.fn().mockReturnValue('mock-model-instance');
    (createOpenAICompatible as jest.Mock).mockReturnValue(mockProviderFn);
    (streamText as jest.Mock).mockReturnValue({ fullStream: [] });

    const module = await Test.createTestingModule({
      providers: [
        AiStreamService,
        {
          provide: AiKeyService,
          useValue: {
            getDecryptedKey: jest.fn(),
            getKeyStatus: jest.fn(),
          },
        },
        {
          provide: EnvironmentService,
          useValue: {
            getAppUrl: jest.fn().mockReturnValue('http://localhost:3000'),
          },
        },
      ],
    }).compile();

    service = module.get(AiStreamService);
    aiKeyService = module.get(AiKeyService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('streamChat', () => {
    it('throws ServiceUnavailableException when no key is configured', async () => {
      (aiKeyService.getDecryptedKey as jest.Mock).mockResolvedValue(null);

      await expect(service.streamChat(WORKSPACE_ID, [])).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('creates the OpenRouter provider with correct base URL, key and headers', async () => {
      (aiKeyService.getDecryptedKey as jest.Mock).mockResolvedValue('sk-test');
      (aiKeyService.getKeyStatus as jest.Mock).mockResolvedValue({
        configured: true,
        model: 'openai/gpt-4o-mini',
      });

      await service.streamChat(WORKSPACE_ID, []);

      expect(createOpenAICompatible).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'openrouter',
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-test',
          headers: expect.objectContaining({
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Docmost',
          }),
        }),
      );
    });

    it('calls streamText with the workspace model and the provided messages', async () => {
      const messages: ModelMessage[] = [{ role: 'user', content: 'hello' }];
      (aiKeyService.getDecryptedKey as jest.Mock).mockResolvedValue('sk-test');
      (aiKeyService.getKeyStatus as jest.Mock).mockResolvedValue({
        configured: true,
        model: 'anthropic/claude-3.5-sonnet',
      });

      await service.streamChat(WORKSPACE_ID, messages);

      expect(mockProviderFn).toHaveBeenCalledWith('anthropic/claude-3.5-sonnet');
      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mock-model-instance',
          messages,
        }),
      );
    });

    it('returns the result from streamText', async () => {
      const fakeResult = { fullStream: ['chunk'], totalUsage: Promise.resolve({}) };
      (streamText as jest.Mock).mockReturnValue(fakeResult);
      (aiKeyService.getDecryptedKey as jest.Mock).mockResolvedValue('sk-test');
      (aiKeyService.getKeyStatus as jest.Mock).mockResolvedValue({
        configured: true,
        model: 'openai/gpt-4o-mini',
      });

      const result = await service.streamChat(WORKSPACE_ID, []);

      expect(result).toBe(fakeResult);
    });
  });
});
