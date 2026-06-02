import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AiChat, AiChatMessage } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export interface AddMessageParams {
  role: string;
  content?: string;
  userId?: string;
  toolCalls?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AiChatService {
  constructor(private readonly aiChatRepo: AiChatRepo) {}

  async createChat(userId: string, workspaceId: string): Promise<AiChat> {
    return this.aiChatRepo.createChat({
      creatorId: userId,
      workspaceId,
    });
  }

  async getChat(
    chatId: string,
    userId: string,
    workspaceId: string,
  ): Promise<AiChat> {
    const chat = await this.aiChatRepo.findChatById(chatId, workspaceId);
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }
    if (chat.creatorId !== userId) {
      throw new ForbiddenException();
    }
    return chat;
  }

  async listChats(
    userId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    return this.aiChatRepo.findChatsByUser(workspaceId, userId, pagination);
  }

  async updateChatTitle(
    chatId: string,
    userId: string,
    workspaceId: string,
    title: string,
  ): Promise<AiChat> {
    await this.getChat(chatId, userId, workspaceId);
    const updated = await this.aiChatRepo.updateChat(chatId, workspaceId, {
      title,
    });
    if (!updated) {
      throw new NotFoundException('Chat not found');
    }
    return updated;
  }

  async deleteChat(
    chatId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.getChat(chatId, userId, workspaceId);
    await this.aiChatRepo.softDeleteChat(chatId, workspaceId);
  }

  async addMessage(
    chatId: string,
    workspaceId: string,
    params: AddMessageParams,
  ): Promise<AiChatMessage> {
    return this.aiChatRepo.insertMessage({
      chatId,
      workspaceId,
      role: params.role,
      content: params.content ?? null,
      userId: params.userId ?? null,
      toolCalls: (params.toolCalls as any) ?? null,
      metadata: (params.metadata as any) ?? null,
    });
  }

  async getMessages(
    chatId: string,
    userId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    await this.getChat(chatId, userId, workspaceId);
    return this.aiChatRepo.findMessagesByChatId(chatId, workspaceId, pagination);
  }

  async searchMessages(
    userId: string,
    workspaceId: string,
    query: string,
    pagination: PaginationOptions,
  ) {
    return this.aiChatRepo.searchMessages(workspaceId, userId, query, pagination);
  }
}
