import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, ModelMessage } from 'ai';
import { AiKeyService } from './ai-key.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

@Injectable()
export class AiStreamService {
  constructor(
    private readonly aiKeyService: AiKeyService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async streamChat(
    workspaceId: string,
    messages: ModelMessage[],
    system?: string,
  ): Promise<ReturnType<typeof streamText>> {
    const apiKey = await this.aiKeyService.getDecryptedKey(workspaceId);
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI not configured for this workspace',
      );
    }

    const { model } = await this.aiKeyService.getKeyStatus(workspaceId);

    const provider = createOpenAICompatible({
      name: 'openrouter',
      baseURL: OPENROUTER_BASE_URL,
      apiKey,
      headers: {
        'HTTP-Referer': this.environmentService.getAppUrl(),
        'X-Title': 'Docmost',
      },
    });

    return streamText({
      model: provider(model),
      messages,
      ...(system ? { system } : {}),
    });
  }
}
