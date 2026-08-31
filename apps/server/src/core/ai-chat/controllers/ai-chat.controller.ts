import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import * as bytes from 'bytes';
import { v7 as uuid7 } from 'uuid';
import { z } from 'zod';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { AiChatService } from '../services/ai-chat.service';
import { AiStreamService } from '../services/ai-stream.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import {
  KanbanRepo,
  KanbanColumnWithCards,
  KanbanCategoryWithOptions,
} from '@docmost/db/repos/kanban/kanban.repo';
import { KanbanMilestone } from '@docmost/db/types/entity.types';
import { KanbanService } from '../../kanban/kanban.service';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';
import { WsService } from '../../../ws/ws.service';
import { StorageService } from '../../../integrations/storage/storage.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { FileInterceptor } from '../../../common/interceptors/file.interceptor';
import {
  getAttachmentFolderPath,
  prepareFile,
} from '../../attachment/attachment.utils';
import { AttachmentType } from '../../attachment/attachment.constants';
import { ChatIdDto, SearchChatDto, UpdateChatDto } from '../dto/chat-id.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { ModelMessage, tool, ToolSet } from 'ai';
import { AiChatMessage } from '@docmost/db/types/entity.types';

const KANBAN_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
const POSITION_STEP = 1000;

@UseGuards(JwtAuthGuard)
@Controller('ai/chats')
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name);

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly aiStreamService: AiStreamService,
    private readonly aiChatRepo: AiChatRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly storageService: StorageService,
    private readonly environmentService: EnvironmentService,
    private readonly pageRepo: PageRepo,
    private readonly kanbanRepo: KanbanRepo,
    private readonly kanbanService: KanbanService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly wsService: WsService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async createChat(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.createChat(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async listChats(
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.listChats(user.id, workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getChatInfo(
    @Body() dto: ChatIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const chat = await this.aiChatService.getChat(
      dto.chatId,
      user.id,
      workspace.id,
    );
    const messages = await this.aiChatRepo.findMessagesByChatId(
      dto.chatId,
      workspace.id,
      { limit: 1000 } as any,
    );
    return { chat, messages: messages.items };
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteChat(
    @Body() dto: ChatIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.aiChatService.deleteChat(dto.chatId, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateChatTitle(
    @Body() dto: UpdateChatDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.updateChatTitle(
      dto.chatId,
      user.id,
      workspace.id,
      dto.title,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('search')
  async searchMessages(
    @Body() dto: SearchChatDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.searchMessages(
      user.id,
      workspace.id,
      dto.query,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor)
  @Post('upload')
  async uploadFile(
    @Req() req: any,
    @Res() reply: FastifyReply,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const maxFileSize = bytes(this.environmentService.getFileUploadSizeLimit());

    let file: any = null;
    try {
      file = await req.file({
        limits: { fileSize: maxFileSize, fields: 2, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${this.environmentService.getFileUploadSizeLimit()} limit`,
        );
      }
    }

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const chatId = (file.fields?.chatId?.value as string) || null;
    const prepared = await prepareFile(file);

    const folderPath = getAttachmentFolderPath(
      AttachmentType.Chat,
      workspace.id,
    );
    const attachmentId = uuid7();
    const filePath = `${folderPath}/${attachmentId}${prepared.fileExtension}`;

    await this.storageService.upload(filePath, prepared.buffer);

    const attachment = await this.attachmentRepo.insertAttachment({
      id: attachmentId,
      fileName: prepared.fileName,
      filePath,
      fileSize: prepared.fileSize,
      fileExt: prepared.fileExtension,
      mimeType: prepared.mimeType,
      type: AttachmentType.Chat,
      creatorId: user.id,
      workspaceId: workspace.id,
      aiChatId: chatId,
    });

    return reply.send({
      id: attachment.id,
      fileName: attachment.fileName,
      fileExt: attachment.fileExt,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
    });
  }

  @Post('send')
  async send(
    @Body() dto: SendMessageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    reply.hijack();
    const raw = reply.raw;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    raw.flushHeaders();

    const write = (event: object) => {
      raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      let chatId = dto.chatId;

      if (!chatId) {
        const chat = await this.aiChatService.createChat(user.id, workspace.id);
        chatId = chat.id;

        const rawTitle = dto.content?.trim() || 'New chat';
        const title = rawTitle.length > 80 ? rawTitle.slice(0, 80) + '…' : rawTitle;
        await this.aiChatRepo.updateChat(chatId, workspace.id, { title });

        write({ type: 'chat_created', chatId });
      } else {
        await this.aiChatService.getChat(chatId, user.id, workspace.id);
      }

      const userMetadata: Record<string, unknown> = {};
      if (dto.mentionedPageIds?.length) {
        userMetadata.mentionedPageIds = dto.mentionedPageIds;
      }
      if (dto.attachmentIds?.length) {
        userMetadata.attachments = dto.attachmentIds;
      }

      await this.aiChatService.addMessage(chatId, workspace.id, {
        role: 'user',
        content: dto.content || null,
        userId: user.id,
        metadata: Object.keys(userMetadata).length ? userMetadata : undefined,
      });

      if (dto.attachmentIds?.length) {
        await this.attachmentRepo.claimAttachmentsForChat(
          dto.attachmentIds,
          chatId,
          user.id,
          workspace.id,
        );
      }

      const history = await this.aiChatRepo.findMessagesByChatId(
        chatId,
        workspace.id,
        { limit: 100 } as any,
      );
      const coreMessages = this.buildCoreMessages(history.items);

      const systemPrompt = await this.buildSystemPrompt(
        dto,
        workspace.id,
      );

      const tools = await this.resolveKanbanTools(dto, user);

      const result = await this.aiStreamService.streamChat(
        workspace.id,
        coreMessages,
        systemPrompt,
        tools,
      );

      let fullContent = '';
      const toolCalls: Array<{
        id: string;
        name: string;
        args: unknown;
      }> = [];

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullContent += part.text;
            write({ type: 'content', text: part.text });
            break;
          case 'tool-call':
            toolCalls.push({
              id: (part as any).toolCallId,
              name: (part as any).toolName,
              args: (part as any).input,
            });
            write({
              type: 'tool_call',
              id: (part as any).toolCallId,
              name: (part as any).toolName,
              args: (part as any).input,
            });
            break;
          case 'tool-result':
            write({
              type: 'tool_result',
              id: (part as any).toolCallId,
              result: (part as any).output,
            });
            break;
          case 'error':
            throw (part as any).error instanceof Error
              ? (part as any).error
              : new Error(String((part as any).error));
        }
      }

      const totalUsage = await result.totalUsage;
      const assistantMsg = await this.aiChatService.addMessage(
        chatId,
        workspace.id,
        {
          role: 'assistant',
          content: fullContent || null,
          toolCalls: toolCalls.length ? toolCalls : undefined,
          metadata: totalUsage
            ? {
                tokenUsage: {
                  inputTokens: totalUsage.inputTokens,
                  outputTokens: totalUsage.outputTokens,
                },
              }
            : undefined,
        },
      );

      write({
        type: 'done',
        messageId: assistantMsg.id,
        usage: totalUsage
          ? {
              inputTokens: totalUsage.inputTokens,
              outputTokens: totalUsage.outputTokens,
            }
          : undefined,
      });
    } catch (err: any) {
      this.logger.error('AI chat stream error', err);
      const code = this.mapErrorCode(err);
      write({
        type: 'error',
        message: err?.message || 'AI request failed',
        code,
        retryable: false,
      });
    }

    raw.write('data: [DONE]\n\n');
    raw.end();
  }

  private async buildSystemPrompt(
    dto: SendMessageDto,
    workspaceId: string,
  ): Promise<string | undefined> {
    const pageIds = [
      ...(dto.contextPageId ? [dto.contextPageId] : []),
      ...(dto.mentionedPageIds ?? []),
    ].filter((id, i, arr) => arr.indexOf(id) === i);

    if (!pageIds.length) return undefined;

    const pages = await Promise.all(
      pageIds.map((id) => this.pageRepo.findById(id, { includeTextContent: true })),
    );

    const validPages = pages.filter(
      (p) => p && p.workspaceId === workspaceId && !p.deletedAt,
    );

    if (!validPages.length) return undefined;

    const pageBlocks = (
      await Promise.all(
        validPages.map(async (p) => {
          const title = p.title || 'Untitled';
          if (p.type === 'kanban') {
            const [columns, milestones, categories] = await Promise.all([
              this.kanbanRepo.getBoardByPageId(p.id),
              this.kanbanRepo.getMilestonesByPageId(p.id),
              this.kanbanRepo.getCategoriesByPageId(p.id),
            ]);
            return `## ${title} (Project Tracker)\n\n${this.formatKanbanAsText(columns, milestones, categories)}`;
          }
          return `## ${title}\n\n${p.textContent?.trim() || '(empty page)'}`;
        }),
      )
    ).filter(Boolean).join('\n\n---\n\n');

    if (!pageBlocks) return undefined;

    return `You are a helpful assistant. Answer based on the conversation and the following page context provided by the user.\n\n${pageBlocks}`;
  }

  private formatKanbanAsText(
    columns: KanbanColumnWithCards[],
    milestones: KanbanMilestone[],
    categories: KanbanCategoryWithOptions[],
  ): string {
    const sections: string[] = [];

    if (milestones.length) {
      sections.push(
        `**Milestones:**\n${milestones
          .map((m) => `- ${m.name} (id: ${m.id})`)
          .join('\n')}`,
      );
    }

    if (categories.length) {
      sections.push(
        `**Categories:**\n${categories
          .map(
            (c) =>
              `- ${c.name} (id: ${c.id}): ${c.options
                .map((o) => `${o.label} (id: ${o.id})`)
                .join(', ') || '(no options)'}`,
          )
          .join('\n')}`,
      );
    }

    if (!columns.length) {
      sections.push('(no columns)');
      return sections.join('\n\n');
    }

    const categoryById = new Map(categories.map((c) => [c.id, c]));

    sections.push(
      columns
        .map((col) => {
          const header = `**${col.name}** (id: ${col.id})`;
          if (!col.cards.length) return `${header}\n(no cards)`;
          const cards = col.cards
            .map((card) => {
              let line = `- [id: ${card.id}] ${card.title || 'Untitled'}`;
              if (card.priority) line += ` [${card.priority}]`;
              if (card.milestone)
                line += ` [milestone: ${card.milestone.name} (id: ${card.milestone.id})]`;
              if (card.dueDate)
                line += ` [due: ${new Date(card.dueDate).toISOString().slice(0, 10)}]`;
              for (const cv of card.categoryValues ?? []) {
                const category = categoryById.get(cv.categoryId);
                const option = category?.options.find((o) => o.id === cv.optionId);
                if (category && option) {
                  line += ` [${category.name}: ${option.label} (id: ${option.id})]`;
                }
              }
              if (card.assignees?.length)
                line += ` [assigned: ${card.assignees.map((a) => a.name).join(', ')}]`;
              if (card.description?.trim()) line += `\n  ${card.description.trim()}`;
              return line;
            })
            .join('\n');
          return `${header}\n${cards}`;
        })
        .join('\n\n'),
    );

    return sections.join('\n\n');
  }

  private async resolveKanbanTools(
    dto: SendMessageDto,
    user: User,
  ): Promise<ToolSet | undefined> {
    if (!dto.contextPageId) return undefined;

    const page = await this.pageRepo.findById(dto.contextPageId);
    if (!page || page.deletedAt || page.type !== 'kanban') return undefined;

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      return undefined;
    }

    return this.buildKanbanTools(page.id, page.spaceId, user.id);
  }

  private buildKanbanTools(
    pageId: string,
    spaceId: string,
    userId: string,
  ): ToolSet {
    const invalidateBoard = () =>
      this.wsService.emitPageScopedEvent(spaceId, pageId, {
        operation: 'invalidate',
        entity: ['kanban-board'],
        id: pageId,
      });

    const toErrorMessage = (err: unknown, fallback: string) =>
      err instanceof Error ? err.message : fallback;

    return {
      create_kanban_card: tool({
        description: 'Create a new card on this Kanban board in the given column.',
        inputSchema: z.object({
          columnId: z.string().uuid(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(KANBAN_PRIORITIES).optional(),
          milestoneId: z.string().uuid().optional(),
        }),
        execute: async ({ columnId, title, description, priority, milestoneId }) => {
          const column = await this.kanbanRepo.findColumnById(columnId);
          if (!column || column.pageId !== pageId) {
            return { ok: false, error: 'Column not found on this board' };
          }
          try {
            const card = await this.kanbanService.createCard(columnId, title, userId);
            if (description !== undefined || priority !== undefined || milestoneId !== undefined) {
              await this.kanbanService.updateCard(
                card.id,
                { description, priority, milestoneId },
                userId,
              );
            }
            await invalidateBoard();
            return { ok: true, cardId: card.id };
          } catch (err) {
            return { ok: false, error: toErrorMessage(err, 'Failed to create card') };
          }
        },
      }),

      move_kanban_card: tool({
        description: 'Move a card to a different column (or reorder within its column).',
        inputSchema: z.object({
          cardId: z.string().uuid(),
          columnId: z.string().uuid(),
          position: z.enum(['top', 'bottom']).optional(),
        }),
        execute: async ({ cardId, columnId, position = 'bottom' }) => {
          const card = await this.kanbanRepo.findCardById(cardId);
          if (!card) return { ok: false, error: 'Card not found on this board' };
          const cardColumn = await this.kanbanRepo.findColumnById(card.columnId);
          if (!cardColumn || cardColumn.pageId !== pageId) {
            return { ok: false, error: 'Card not found on this board' };
          }
          const targetColumn = await this.kanbanRepo.findColumnById(columnId);
          if (!targetColumn || targetColumn.pageId !== pageId) {
            return { ok: false, error: 'Target column not found on this board' };
          }
          try {
            const numericPosition =
              position === 'top'
                ? (await this.kanbanRepo.getMinCardPosition(columnId)) - POSITION_STEP
                : (await this.kanbanRepo.getMaxCardPosition(columnId)) + POSITION_STEP;
            await this.kanbanService.moveCard(cardId, columnId, numericPosition, userId);
            await invalidateBoard();
            return { ok: true };
          } catch (err) {
            return { ok: false, error: toErrorMessage(err, 'Failed to move card') };
          }
        },
      }),

      update_kanban_card: tool({
        description: "Update a card's title, description, priority, milestone, or due date.",
        inputSchema: z.object({
          cardId: z.string().uuid(),
          title: z.string().optional(),
          description: z.string().optional(),
          priority: z.union([z.enum(KANBAN_PRIORITIES), z.literal('none')]).optional(),
          milestoneId: z.union([z.string().uuid(), z.literal('none')]).optional(),
          dueDate: z.union([z.string(), z.literal('none')]).optional(),
        }),
        execute: async ({ cardId, title, description, priority, milestoneId, dueDate }) => {
          if (
            title === undefined &&
            description === undefined &&
            priority === undefined &&
            milestoneId === undefined &&
            dueDate === undefined
          ) {
            return { ok: false, error: 'no changes given' };
          }
          const card = await this.kanbanRepo.findCardById(cardId);
          if (!card) return { ok: false, error: 'Card not found on this board' };
          const column = await this.kanbanRepo.findColumnById(card.columnId);
          if (!column || column.pageId !== pageId) {
            return { ok: false, error: 'Card not found on this board' };
          }
          try {
            await this.kanbanService.updateCard(
              cardId,
              {
                title,
                description,
                priority: priority === 'none' ? null : priority,
                milestoneId: milestoneId === 'none' ? null : milestoneId,
                dueDate: dueDate === 'none' ? null : dueDate,
              },
              userId,
            );
            await invalidateBoard();
            return { ok: true };
          } catch (err) {
            return { ok: false, error: toErrorMessage(err, 'Failed to update card') };
          }
        },
      }),

      set_kanban_card_category: tool({
        description: "Set (or clear) a card's value for a board category.",
        inputSchema: z.object({
          cardId: z.string().uuid(),
          categoryId: z.string().uuid(),
          optionId: z.union([z.string().uuid(), z.literal('none')]),
        }),
        execute: async ({ cardId, categoryId, optionId }) => {
          const card = await this.kanbanRepo.findCardById(cardId);
          if (!card) return { ok: false, error: 'Card not found on this board' };
          const column = await this.kanbanRepo.findColumnById(card.columnId);
          if (!column || column.pageId !== pageId) {
            return { ok: false, error: 'Card not found on this board' };
          }
          const category = await this.kanbanRepo.findCategoryById(categoryId);
          if (!category || category.pageId !== pageId) {
            return { ok: false, error: 'Category not found on this board' };
          }
          try {
            await this.kanbanService.setCardCategoryValue(
              cardId,
              categoryId,
              optionId === 'none' ? null : optionId,
              userId,
            );
            await invalidateBoard();
            return { ok: true };
          } catch (err) {
            return { ok: false, error: toErrorMessage(err, 'Failed to set category') };
          }
        },
      }),
    };
  }

  private buildCoreMessages(messages: AiChatMessage[]): ModelMessage[] {
    return messages
      .filter((m) => !m.deletedAt && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => {
        if (m.role === 'user') {
          return { role: 'user' as const, content: m.content || '' };
        }
        return { role: 'assistant' as const, content: m.content || '' };
      });
  }

  private mapErrorCode(err: any): string | undefined {
    const status = err?.status ?? err?.statusCode;
    if (status === 401) return 'invalid_key';
    if (status === 404 || status === 400) return 'model_unavailable';
    return undefined;
  }
}
