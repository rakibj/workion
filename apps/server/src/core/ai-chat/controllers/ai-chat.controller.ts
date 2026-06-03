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
import { ModelMessage } from 'ai';
import { AiChatMessage } from '@docmost/db/types/entity.types';

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

      const result = await this.aiStreamService.streamChat(
        workspace.id,
        coreMessages,
        systemPrompt,
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

    const pageBlocks = validPages
      .map((p) => `## ${p.title || 'Untitled'}\n\n${p.textContent?.trim() || '(empty page)'}`)
      .join('\n\n---\n\n');

    return `You are a helpful assistant. Answer based on the conversation and the following page context provided by the user.\n\n${pageBlocks}`;
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
