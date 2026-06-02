import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiChatService } from './ai-chat.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const OWNER_ID = '00000000-0000-0000-0000-000000000010';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000011';
const CHAT_ID = '00000000-0000-0000-0000-000000000020';

function makeChat(overrides: Record<string, any> = {}) {
  return {
    id: CHAT_ID,
    workspaceId: WORKSPACE_ID,
    creatorId: OWNER_ID,
    title: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as any;
}

function makeMessage(overrides: Record<string, any> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000030',
    chatId: CHAT_ID,
    workspaceId: WORKSPACE_ID,
    userId: OWNER_ID,
    role: 'user',
    content: 'hello',
    toolCalls: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as any;
}

const paginationOpts = new PaginationOptions();

describe('AiChatService', () => {
  let service: AiChatService;
  let aiChatRepo: jest.Mocked<AiChatRepo>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<Partial<AiChatRepo>> = {
      createChat: jest.fn(),
      findChatById: jest.fn(),
      findChatsByUser: jest.fn(),
      updateChat: jest.fn(),
      softDeleteChat: jest.fn(),
      insertMessage: jest.fn(),
      findMessagesByChatId: jest.fn(),
      searchMessages: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AiChatService,
        { provide: AiChatRepo, useValue: repoMock },
      ],
    }).compile();

    service = module.get(AiChatService);
    aiChatRepo = module.get(AiChatRepo) as jest.Mocked<AiChatRepo>;
  });

  describe('createChat', () => {
    it('creates a chat with the correct creator and workspace', async () => {
      aiChatRepo.createChat.mockResolvedValue(makeChat());

      const result = await service.createChat(OWNER_ID, WORKSPACE_ID);

      expect(aiChatRepo.createChat).toHaveBeenCalledWith({
        creatorId: OWNER_ID,
        workspaceId: WORKSPACE_ID,
      });
      expect(result.creatorId).toBe(OWNER_ID);
    });
  });

  describe('getChat', () => {
    it('returns the chat for the owning user', async () => {
      aiChatRepo.findChatById.mockResolvedValue(makeChat());

      const result = await service.getChat(CHAT_ID, OWNER_ID, WORKSPACE_ID);

      expect(result.id).toBe(CHAT_ID);
    });

    it('throws NotFoundException when chat does not exist', async () => {
      aiChatRepo.findChatById.mockResolvedValue(undefined);

      await expect(
        service.getChat(CHAT_ID, OWNER_ID, WORKSPACE_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a different user tries to access', async () => {
      aiChatRepo.findChatById.mockResolvedValue(makeChat());

      await expect(
        service.getChat(CHAT_ID, OTHER_USER_ID, WORKSPACE_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateChatTitle', () => {
    it('updates the chat title', async () => {
      aiChatRepo.findChatById.mockResolvedValue(makeChat());
      aiChatRepo.updateChat.mockResolvedValue(makeChat({ title: 'New Title' }));

      const result = await service.updateChatTitle(
        CHAT_ID,
        OWNER_ID,
        WORKSPACE_ID,
        'New Title',
      );

      expect(aiChatRepo.updateChat).toHaveBeenCalledWith(
        CHAT_ID,
        WORKSPACE_ID,
        { title: 'New Title' },
      );
      expect(result.title).toBe('New Title');
    });

    it('throws ForbiddenException if caller does not own the chat', async () => {
      aiChatRepo.findChatById.mockResolvedValue(makeChat());

      await expect(
        service.updateChatTitle(CHAT_ID, OTHER_USER_ID, WORKSPACE_ID, 'X'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteChat', () => {
    it('soft-deletes the chat for the owner', async () => {
      aiChatRepo.findChatById.mockResolvedValue(makeChat());
      aiChatRepo.softDeleteChat.mockResolvedValue(undefined);

      await service.deleteChat(CHAT_ID, OWNER_ID, WORKSPACE_ID);

      expect(aiChatRepo.softDeleteChat).toHaveBeenCalledWith(
        CHAT_ID,
        WORKSPACE_ID,
      );
    });

    it('throws ForbiddenException if caller does not own the chat', async () => {
      aiChatRepo.findChatById.mockResolvedValue(makeChat());

      await expect(
        service.deleteChat(CHAT_ID, OTHER_USER_ID, WORKSPACE_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(aiChatRepo.softDeleteChat).not.toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('inserts a message with the supplied params', async () => {
      aiChatRepo.insertMessage.mockResolvedValue(makeMessage());

      await service.addMessage(CHAT_ID, WORKSPACE_ID, {
        role: 'user',
        content: 'hello',
        userId: OWNER_ID,
      });

      expect(aiChatRepo.insertMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: CHAT_ID,
          workspaceId: WORKSPACE_ID,
          role: 'user',
          content: 'hello',
          userId: OWNER_ID,
        }),
      );
    });

    it('allows inserting an assistant message without a userId', async () => {
      aiChatRepo.insertMessage.mockResolvedValue(makeMessage({ role: 'assistant', userId: null }));

      await service.addMessage(CHAT_ID, WORKSPACE_ID, {
        role: 'assistant',
        content: 'I can help with that.',
      });

      expect(aiChatRepo.insertMessage).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant', userId: null }),
      );
    });
  });

  describe('getMessages', () => {
    it('returns messages for the owning user', async () => {
      aiChatRepo.findChatById.mockResolvedValue(makeChat());
      aiChatRepo.findMessagesByChatId.mockResolvedValue({ items: [], meta: {} } as any);

      await service.getMessages(CHAT_ID, OWNER_ID, WORKSPACE_ID, paginationOpts);

      expect(aiChatRepo.findMessagesByChatId).toHaveBeenCalledWith(
        CHAT_ID,
        WORKSPACE_ID,
        paginationOpts,
      );
    });

    it('throws ForbiddenException for a non-owner', async () => {
      aiChatRepo.findChatById.mockResolvedValue(makeChat());

      await expect(
        service.getMessages(CHAT_ID, OTHER_USER_ID, WORKSPACE_ID, paginationOpts),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('searchMessages', () => {
    it('delegates to the repo search', async () => {
      aiChatRepo.searchMessages.mockResolvedValue({ items: [], meta: {} } as any);

      await service.searchMessages(OWNER_ID, WORKSPACE_ID, 'hello', paginationOpts);

      expect(aiChatRepo.searchMessages).toHaveBeenCalledWith(
        WORKSPACE_ID,
        OWNER_ID,
        'hello',
        paginationOpts,
      );
    });
  });
});
