import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from '../services/ai-chat.service';
import { AiStreamService } from '../services/ai-stream.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { KanbanRepo } from '@docmost/db/repos/kanban/kanban.repo';
import { KanbanService } from '../../kanban/kanban.service';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import { WsService } from '../../../ws/ws.service';
import { StorageService } from '../../../integrations/storage/storage.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const CHAT_ID = '00000000-0000-0000-0000-000000000020';
const MSG_ID = '00000000-0000-0000-0000-000000000030';
const PAGE_ID = '00000000-0000-0000-0000-000000000040';
const SPACE_ID = '00000000-0000-0000-0000-000000000050';
const COLUMN_ID = '00000000-0000-0000-0000-000000000060';
const CARD_ID = '00000000-0000-0000-0000-000000000070';

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

function makePage(overrides: Record<string, any> = {}) {
  return {
    id: PAGE_ID,
    spaceId: SPACE_ID,
    workspaceId: WORKSPACE_ID,
    type: 'kanban',
    title: 'Board',
    deletedAt: null,
    ...overrides,
  } as any;
}

describe('AiChatController', () => {
  let controller: AiChatController;
  let aiChatService: jest.Mocked<AiChatService>;
  let aiStreamService: jest.Mocked<AiStreamService>;
  let aiChatRepo: jest.Mocked<AiChatRepo>;
  let attachmentRepo: jest.Mocked<AttachmentRepo>;
  let pageRepo: jest.Mocked<PageRepo>;
  let kanbanRepo: jest.Mocked<KanbanRepo>;
  let kanbanService: jest.Mocked<KanbanService>;
  let spaceAbility: jest.Mocked<SpaceAbilityFactory>;
  let wsService: jest.Mocked<WsService>;

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
            updateChat: jest.fn(),
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
          provide: PageRepo,
          useValue: { findById: jest.fn() },
        },
        {
          provide: KanbanRepo,
          useValue: {
            getBoardByPageId: jest.fn().mockResolvedValue([]),
            getMilestonesByPageId: jest.fn().mockResolvedValue([]),
            getCategoriesByPageId: jest.fn().mockResolvedValue([]),
            findColumnById: jest.fn(),
            findCardById: jest.fn(),
            findCategoryById: jest.fn(),
            getMaxCardPosition: jest.fn().mockResolvedValue(0),
            getMinCardPosition: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: KanbanService,
          useValue: {
            createCard: jest.fn(),
            updateCard: jest.fn(),
            moveCard: jest.fn(),
            setCardCategoryValue: jest.fn(),
          },
        },
        {
          provide: SpaceAbilityFactory,
          useValue: { createForUser: jest.fn() },
        },
        {
          provide: WsService,
          useValue: { emitPageScopedEvent: jest.fn() },
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
    pageRepo = module.get(PageRepo);
    kanbanRepo = module.get(KanbanRepo);
    kanbanService = module.get(KanbanService);
    spaceAbility = module.get(SpaceAbilityFactory);
    wsService = module.get(WsService);
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

  describe('kanban tools', () => {
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

    function stubHappyPathStream() {
      aiChatService.createChat.mockResolvedValue(makeChat());
      aiChatService.addMessage.mockResolvedValue(makeMessage());
      aiChatRepo.findMessagesByChatId.mockResolvedValue(makePaginated([]) as any);
      aiStreamService.streamChat.mockResolvedValue({
        fullStream: makeStream([]),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      } as any);
    }

    function allowEdit() {
      spaceAbility.createForUser.mockResolvedValue({
        cannot: jest.fn().mockReturnValue(false),
      } as any);
    }

    function denyEdit() {
      spaceAbility.createForUser.mockResolvedValue({
        cannot: jest.fn().mockReturnValue(true),
      } as any);
    }

    async function getTools() {
      stubHappyPathStream();
      pageRepo.findById.mockResolvedValue(makePage());
      allowEdit();

      await controller.send(
        { content: 'hi', contextPageId: PAGE_ID } as any,
        makeUser(),
        makeWorkspace(),
        makeReply(),
      );

      return aiStreamService.streamChat.mock.calls[0][3] as Record<string, any>;
    }

    it('registers kanban tools when contextPageId is a kanban page the user can edit', async () => {
      const tools = await getTools();

      expect(tools).toBeDefined();
      expect(Object.keys(tools)).toEqual(
        expect.arrayContaining([
          'create_kanban_card',
          'move_kanban_card',
          'update_kanban_card',
          'set_kanban_card_category',
        ]),
      );
    });

    it('omits kanban tools when contextPageId is unset', async () => {
      stubHappyPathStream();

      await controller.send(
        { content: 'hi' } as any,
        makeUser(),
        makeWorkspace(),
        makeReply(),
      );

      expect(aiStreamService.streamChat.mock.calls[0][3]).toBeUndefined();
      expect(pageRepo.findById).not.toHaveBeenCalled();
    });

    it('omits kanban tools when the context page is not a kanban board', async () => {
      stubHappyPathStream();
      pageRepo.findById.mockResolvedValue(makePage({ type: 'document' }));

      await controller.send(
        { content: 'hi', contextPageId: PAGE_ID } as any,
        makeUser(),
        makeWorkspace(),
        makeReply(),
      );

      expect(aiStreamService.streamChat.mock.calls[0][3]).toBeUndefined();
      expect(spaceAbility.createForUser).not.toHaveBeenCalled();
    });

    it('omits kanban tools when the user only has read access', async () => {
      stubHappyPathStream();
      pageRepo.findById.mockResolvedValue(makePage());
      denyEdit();

      await controller.send(
        { content: 'hi', contextPageId: PAGE_ID } as any,
        makeUser(),
        makeWorkspace(),
        makeReply(),
      );

      expect(aiStreamService.streamChat.mock.calls[0][3]).toBeUndefined();
    });

    describe('tool execution', () => {
      it('create_kanban_card returns ok:false for a column not on this board', async () => {
        const tools = await getTools();
        kanbanRepo.findColumnById.mockResolvedValue(undefined);

        const result = await tools.create_kanban_card.execute({
          columnId: COLUMN_ID,
          title: 'x',
        });

        expect(result).toEqual({ ok: false, error: expect.any(String) });
        expect(kanbanService.createCard).not.toHaveBeenCalled();
      });

      it('create_kanban_card creates the card and invalidates the board on success', async () => {
        const tools = await getTools();
        kanbanRepo.findColumnById.mockResolvedValue({
          id: COLUMN_ID,
          pageId: PAGE_ID,
        } as any);
        kanbanService.createCard.mockResolvedValue({ id: CARD_ID } as any);

        const result = await tools.create_kanban_card.execute({
          columnId: COLUMN_ID,
          title: 'New card',
        });

        expect(result).toEqual({ ok: true, cardId: CARD_ID });
        expect(kanbanService.createCard).toHaveBeenCalledWith(
          COLUMN_ID,
          'New card',
          USER_ID,
        );
        expect(wsService.emitPageScopedEvent).toHaveBeenCalledWith(
          SPACE_ID,
          PAGE_ID,
          expect.objectContaining({
            operation: 'invalidate',
            entity: ['kanban-board'],
            id: PAGE_ID,
          }),
        );
      });

      it('move_kanban_card returns ok:false for a card not on this board', async () => {
        const tools = await getTools();
        kanbanRepo.findCardById.mockResolvedValue(undefined);

        const result = await tools.move_kanban_card.execute({
          cardId: CARD_ID,
          columnId: COLUMN_ID,
        });

        expect(result).toEqual({ ok: false, error: expect.any(String) });
        expect(kanbanService.moveCard).not.toHaveBeenCalled();
      });

      it('update_kanban_card returns ok:false when no fields are given', async () => {
        const tools = await getTools();

        const result = await tools.update_kanban_card.execute({ cardId: CARD_ID });

        expect(result).toEqual({ ok: false, error: 'no changes given' });
        expect(kanbanRepo.findCardById).not.toHaveBeenCalled();
      });

      it('update_kanban_card sets dueDate on a card on this board', async () => {
        const tools = await getTools();
        kanbanRepo.findCardById.mockResolvedValue({
          id: CARD_ID,
          columnId: COLUMN_ID,
        } as any);
        kanbanRepo.findColumnById.mockResolvedValue({
          id: COLUMN_ID,
          pageId: PAGE_ID,
        } as any);

        const result = await tools.update_kanban_card.execute({
          cardId: CARD_ID,
          dueDate: '2026-09-15',
        });

        expect(result).toEqual({ ok: true });
        expect(kanbanService.updateCard).toHaveBeenCalledWith(
          CARD_ID,
          expect.objectContaining({ dueDate: '2026-09-15' }),
          USER_ID,
        );
      });

      it('update_kanban_card clears dueDate when given "none"', async () => {
        const tools = await getTools();
        kanbanRepo.findCardById.mockResolvedValue({
          id: CARD_ID,
          columnId: COLUMN_ID,
        } as any);
        kanbanRepo.findColumnById.mockResolvedValue({
          id: COLUMN_ID,
          pageId: PAGE_ID,
        } as any);

        const result = await tools.update_kanban_card.execute({
          cardId: CARD_ID,
          dueDate: 'none',
        });

        expect(result).toEqual({ ok: true });
        expect(kanbanService.updateCard).toHaveBeenCalledWith(
          CARD_ID,
          expect.objectContaining({ dueDate: null }),
          USER_ID,
        );
      });

      it('set_kanban_card_category returns ok:false for a category not on this board', async () => {
        const tools = await getTools();
        kanbanRepo.findCardById.mockResolvedValue({
          id: CARD_ID,
          columnId: COLUMN_ID,
        } as any);
        kanbanRepo.findColumnById.mockResolvedValue({
          id: COLUMN_ID,
          pageId: PAGE_ID,
        } as any);
        kanbanRepo.findCategoryById.mockResolvedValue(undefined);

        const result = await tools.set_kanban_card_category.execute({
          cardId: CARD_ID,
          categoryId: '00000000-0000-0000-0000-000000000099',
          optionId: 'none',
        });

        expect(result).toEqual({ ok: false, error: expect.any(String) });
        expect(kanbanService.setCardCategoryValue).not.toHaveBeenCalled();
      });
    });
  });
});
