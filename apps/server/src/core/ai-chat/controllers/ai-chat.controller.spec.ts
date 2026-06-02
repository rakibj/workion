import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from '../services/ai-chat.service';
import { AiStreamService } from '../services/ai-stream.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { StorageService } from '../../../integrations/storage/storage.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const CHAT_ID = '00000000-0000-0000-0000-000000000020';
const MSG_ID = '00000000-0000-0000-0000-000000000030';

function makeUser(overrides: Record<string, any> = {}) {
  return { id: USER_ID, workspaceId: WORKSPACE_ID, ...overrides } as any;
}

function makeWorkspace(overrides: Record<string, any> = {}) {
  return { id: WORKSPACE_ID, ...overrides } as any;
}

function makeChat(overrides: Record<string, any> = {}) {
  return {
    id: CHAT_ID,
    workspaceId: WORKSPACE_ID,
    creatorId: USER_ID,
    title: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as any;
}

function makeMessage(overrides: Record<string, any> = {}) {
  return {
    id: MSG_ID,
    chatId: CHAT_ID,
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
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

function makePaginated(items: any[]) {
  return { items, nextCursor: null, prevCursor: null };
}

describe('AiChatController', () => {
  let controller: AiChatController;
  let aiChatService: jest.Mocked<AiChatService>;
  let aiStreamService: jest.Mocked<AiStreamService>;
  let aiChatRepo: jest.Mocked<AiChatRepo>;
  let attachmentRepo: jest.Mocked<AttachmentRepo>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AiChatController],
      providers: [
        {
          provide: AiChatService,
          useValue: {
            createChat: jest.fn(),
            getChat: jest.fn(),
            listChats: jest.fn(),
            updateChatTitle: jest.fn(),
            deleteChat: jest.fn(),
            addMessage: jest.fn(),
            getMessages: jest.fn(),
            searchMessages: jest.fn(),
          },
        },
        {
          provide: AiStreamService,
          useValue: { streamChat: jest.fn() },
        },
        {
          provide: AiChatRepo,
          useValue: {
            findMessagesByChatId: jest.fn(),
          },
        },
        {
          provide: AttachmentRepo,
          useValue: {
            insertAttachment: jest.fn(),
            claimAttachmentsForChat: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: { upload: jest.fn() },
        },
        {
          provide: EnvironmentService,
          useValue: {
            getFileUploadSizeLimit: jest.fn().mockReturnValue('50mb'),
            getAppUrl: jest.fn().mockReturnValue('http://localhost:3000'),
          },
        },
      ],
    }).compile();

    controller = module.get(AiChatController);
    aiChatService = module.get(AiChatService);
    aiStreamService = module.get(AiStreamService);
    aiChatRepo = module.get(AiChatRepo);
    attachmentRepo = module.get(AttachmentRepo);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createChat', () => {
    it('creates and returns a new chat', async () => {
      const chat = makeChat();
      aiChatService.createChat.mockResolvedValue(chat);

      const result = await controller.createChat(makeUser(), makeWorkspace());

      expect(aiChatService.createChat).toHaveBeenCalledWith(
        USER_ID,
        WORKSPACE_ID,
      );
      expect(result).toBe(chat);
    });
  });

  describe('listChats', () => {
    it('returns paginated chats for the user', async () => {
      const page = makePaginated([makeChat()]);
      aiChatService.listChats.mockResolvedValue(page as any);

      const result = await controller.listChats(
        { limit: 20 } as any,
        makeUser(),
        makeWorkspace(),
      );

      expect(aiChatService.listChats).toHaveBeenCalledWith(
        USER_ID,
        WORKSPACE_ID,
        expect.objectContaining({ limit: 20 }),
      );
      expect(result).toBe(page);
    });
  });

  describe('getChatInfo', () => {
    it('returns chat and messages', async () => {
      const chat = makeChat();
      const messages = [makeMessage()];
      aiChatService.getChat.mockResolvedValue(chat);
      aiChatRepo.findMessagesByChatId.mockResolvedValue(
        makePaginated(messages) as any,
      );

      const result = await controller.getChatInfo(
        { chatId: CHAT_ID },
        makeUser(),
        makeWorkspace(),
      );

      expect(result).toEqual({ chat, messages });
    });

    it('propagates NotFoundException from service', async () => {
      aiChatService.getChat.mockRejectedValue(new NotFoundException());

      await expect(
        controller.getChatInfo({ chatId: CHAT_ID }, makeUser(), makeWorkspace()),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates ForbiddenException when user does not own the chat', async () => {
      aiChatService.getChat.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.getChatInfo({ chatId: CHAT_ID }, makeUser(), makeWorkspace()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteChat', () => {
    it('delegates deletion to the service', async () => {
      aiChatService.deleteChat.mockResolvedValue(undefined);

      await controller.deleteChat(
        { chatId: CHAT_ID },
        makeUser(),
        makeWorkspace(),
      );

      expect(aiChatService.deleteChat).toHaveBeenCalledWith(
        CHAT_ID,
        USER_ID,
        WORKSPACE_ID,
      );
    });
  });

  describe('updateChatTitle', () => {
    it('delegates title update to the service and returns updated chat', async () => {
      const updated = makeChat({ title: 'New title' });
      aiChatService.updateChatTitle.mockResolvedValue(updated);

      const result = await controller.updateChatTitle(
        { chatId: CHAT_ID, title: 'New title' },
        makeUser(),
        makeWorkspace(),
      );

      expect(aiChatService.updateChatTitle).toHaveBeenCalledWith(
        CHAT_ID,
        USER_ID,
        WORKSPACE_ID,
        'New title',
      );
      expect(result).toBe(updated);
    });
  });

  describe('searchMessages', () => {
    it('delegates search to the service', async () => {
      const page = makePaginated([makeMessage()]);
      aiChatService.searchMessages.mockResolvedValue(page as any);

      const result = await controller.searchMessages(
        { query: 'hello' },
        { limit: 20 } as any,
        makeUser(),
        makeWorkspace(),
      );

      expect(aiChatService.searchMessages).toHaveBeenCalledWith(
        USER_ID,
        WORKSPACE_ID,
        'hello',
        expect.objectContaining({ limit: 20 }),
      );
      expect(result).toBe(page);
    });
  });

  describe('send', () => {
    function makeReply() {
      return {
        hijack: jest.fn(),
        raw: {
          setHeader: jest.fn(),
          flushHeaders: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
        },
      } as any;
    }

    async function* makeStream(
      parts: Array<Record<string, unknown>>,
    ): AsyncGenerator<any> {
      for (const part of parts) {
        yield part;
      }
    }

    it('writes chat_created event when no chatId is provided', async () => {
      const chat = makeChat();
      const assistantMsg = makeMessage({ id: 'asst-1', role: 'assistant', content: 'Hi' });
      aiChatService.createChat.mockResolvedValue(chat);
      aiChatService.addMessage.mockResolvedValue(assistantMsg);
      aiChatRepo.findMessagesByChatId.mockResolvedValue(makePaginated([]) as any);
      aiStreamService.streamChat.mockResolvedValue({
        fullStream: makeStream([
          { type: 'text-delta', text: 'Hi' },
        ]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      } as any);

      const reply = makeReply();
      await controller.send(
        { content: 'hello' } as any,
        makeUser(),
        makeWorkspace(),
        reply,
      );

      const writes = reply.raw.write.mock.calls.map((c: any[]) => c[0]);
      expect(writes.some((w: string) => w.includes('"type":"chat_created"'))).toBe(true);
    });

    it('streams text-delta as content events', async () => {
      const chat = makeChat();
      const assistantMsg = makeMessage({ id: 'asst-1', role: 'assistant', content: 'Hello world' });
      aiChatService.createChat.mockResolvedValue(chat);
      aiChatService.addMessage.mockResolvedValue(assistantMsg);
      aiChatRepo.findMessagesByChatId.mockResolvedValue(makePaginated([]) as any);
      aiStreamService.streamChat.mockResolvedValue({
        fullStream: makeStream([
          { type: 'text-delta', text: 'Hello ' },
          { type: 'text-delta', text: 'world' },
        ]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      } as any);

      const reply = makeReply();
      await controller.send(
        { content: 'hi' } as any,
        makeUser(),
        makeWorkspace(),
        reply,
      );

      const writes = reply.raw.write.mock.calls.map((c: any[]) => c[0]);
      expect(
        writes.some((w: string) => w.includes('"type":"content"') && w.includes('"text":"Hello "')),
      ).toBe(true);
      expect(
        writes.some((w: string) => w.includes('"type":"content"') && w.includes('"text":"world"')),
      ).toBe(true);
    });

    it('writes done event with messageId after the stream finishes', async () => {
      const chat = makeChat();
      const assistantMsg = makeMessage({ id: 'asst-99', role: 'assistant', content: 'Done' });
      aiChatService.createChat.mockResolvedValue(chat);
      aiChatService.addMessage.mockResolvedValue(assistantMsg);
      aiChatRepo.findMessagesByChatId.mockResolvedValue(makePaginated([]) as any);
      aiStreamService.streamChat.mockResolvedValue({
        fullStream: makeStream([{ type: 'text-delta', text: 'Done' }]),
        totalUsage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
      } as any);

      const reply = makeReply();
      await controller.send(
        { content: 'go' } as any,
        makeUser(),
        makeWorkspace(),
        reply,
      );

      const writes = reply.raw.write.mock.calls.map((c: any[]) => c[0]);
      expect(
        writes.some(
          (w: string) =>
            w.includes('"type":"done"') && w.includes('"messageId":"asst-99"'),
        ),
      ).toBe(true);
      expect(writes[writes.length - 1]).toBe('data: [DONE]\n\n');
    });

    it('writes an error event and terminates cleanly when streaming fails', async () => {
      const chat = makeChat();
      aiChatService.createChat.mockResolvedValue(chat);
      aiChatService.addMessage.mockResolvedValue(makeMessage() as any);
      aiChatRepo.findMessagesByChatId.mockResolvedValue(makePaginated([]) as any);
      aiStreamService.streamChat.mockRejectedValue(
        Object.assign(new Error('AI not configured'), { status: 503 }),
      );

      const reply = makeReply();
      await controller.send(
        { content: 'hi' } as any,
        makeUser(),
        makeWorkspace(),
        reply,
      );

      const writes = reply.raw.write.mock.calls.map((c: any[]) => c[0]);
      expect(
        writes.some((w: string) => w.includes('"type":"error"')),
      ).toBe(true);
      expect(writes[writes.length - 1]).toBe('data: [DONE]\n\n');
      expect(reply.raw.end).toHaveBeenCalled();
    });
  });
});
