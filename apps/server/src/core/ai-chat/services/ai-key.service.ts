import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

@Injectable()
export class AiKeyService {
  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
  ) {}

  async saveKey(
    workspaceId: string,
    apiKey: string,
    model?: string,
  ): Promise<void> {
    const encrypted = this.encrypt(apiKey, workspaceId);
    await this.workspaceRepo.updateAiSettings(
      workspaceId,
      'openrouterKey',
      encrypted,
    );
    await this.workspaceRepo.updateAiSettings(
      workspaceId,
      'openrouterModel',
      model ?? DEFAULT_MODEL,
    );
  }

  async removeKey(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const settings = ((workspace?.settings ?? {}) as Record<string, any>);
    const ai = { ...(settings.ai ?? {}) };
    delete ai.openrouterKey;
    delete ai.openrouterModel;
    await this.workspaceRepo.updateWorkspace(
      { settings: { ...settings, ai } },
      workspaceId,
    );
  }

  async getKeyStatus(
    workspaceId: string,
  ): Promise<{ configured: boolean; model: string }> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const ai = ((workspace?.settings as any)?.ai ?? {}) as Record<string, any>;
    return {
      configured: !!ai.openrouterKey,
      model: (ai.openrouterModel as string) ?? DEFAULT_MODEL,
    };
  }

  async getDecryptedKey(workspaceId: string): Promise<string | null> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const ai = ((workspace?.settings as any)?.ai ?? {}) as Record<string, any>;
    if (!ai.openrouterKey) return null;
    return this.decrypt(ai.openrouterKey as string, workspaceId);
  }

  private deriveKey(workspaceId: string): Buffer {
    return crypto.scryptSync(
      this.environmentService.getAppSecret(),
      workspaceId,
      32,
    );
  }

  private encrypt(plaintext: string, workspaceId: string): string {
    const key = this.deriveKey(workspaceId);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decrypt(ciphertext: string, workspaceId: string): string {
    const key = this.deriveKey(workspaceId);
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_BYTES);
    const authTag = data.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
    const encrypted = data.subarray(IV_BYTES + AUTH_TAG_BYTES);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }
}
