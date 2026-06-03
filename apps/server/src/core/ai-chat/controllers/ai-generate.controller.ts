import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { AiStreamService } from '../services/ai-stream.service';
import { AiAction, AiGenerateDto } from '../dto/ai-generate.dto';

const ACTION_PROMPTS: Record<AiAction, (prompt?: string) => string> = {
  [AiAction.IMPROVE_WRITING]: () =>
    'Improve the writing quality of the following text. Return only the improved text, no explanations.',
  [AiAction.FIX_SPELLING_GRAMMAR]: () =>
    'Fix all spelling and grammar errors. Return only the corrected text.',
  [AiAction.MAKE_SHORTER]: () =>
    'Make the following text more concise while preserving meaning. Return only the shortened text.',
  [AiAction.MAKE_LONGER]: () =>
    'Expand the following text with more detail. Return only the expanded text.',
  [AiAction.SIMPLIFY]: () =>
    'Simplify the following text to make it easier to understand. Return only the simplified text.',
  [AiAction.CONTINUE_WRITING]: () =>
    'Continue writing from where this text leaves off. Return only the continuation.',
  [AiAction.EXPLAIN]: () =>
    'Explain the following text in simple terms. Return only the explanation.',
  [AiAction.SUMMARIZE]: () =>
    'Summarize the following text. Return only the summary.',
  [AiAction.CHANGE_TONE]: (prompt) =>
    `Rewrite the following text in a ${prompt ?? 'neutral'} tone. Return only the rewritten text.`,
  [AiAction.TRANSLATE]: (prompt) =>
    `Translate the following text to ${prompt ?? 'English'}. Return only the translated text.`,
  [AiAction.CUSTOM]: (prompt) => prompt ?? 'Process the following text.',
};

@UseGuards(JwtAuthGuard)
@Controller('ai/generate')
export class AiGenerateController {
  private readonly logger = new Logger(AiGenerateController.name);

  constructor(private readonly aiStreamService: AiStreamService) {}

  @Post('stream')
  async stream(
    @Body() dto: AiGenerateDto,
    @AuthWorkspace() workspace: Workspace,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    reply.hijack();
    const raw = reply.raw;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    raw.flushHeaders();

    const write = (data: object) => {
      raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const systemPrompt = this.buildSystemPrompt(dto);
      const result = await this.aiStreamService.streamChat(
        workspace.id,
        [{ role: 'user', content: dto.content }],
        systemPrompt,
      );

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          write({ content: part.text });
        } else if (part.type === 'error') {
          throw (part as any).error instanceof Error
            ? (part as any).error
            : new Error(String((part as any).error));
        }
      }
    } catch (err: any) {
      this.logger.error('AI generate stream error', err);
      write({ error: err?.message ?? 'AI request failed' });
    }

    raw.write('data: [DONE]\n\n');
    raw.end();
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async generate(
    @Body() dto: AiGenerateDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const systemPrompt = this.buildSystemPrompt(dto);
    const result = await this.aiStreamService.streamChat(
      workspace.id,
      [{ role: 'user', content: dto.content }],
      systemPrompt,
    );

    let content = '';
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        content += part.text;
      } else if (part.type === 'error') {
        throw (part as any).error instanceof Error
          ? (part as any).error
          : new Error(String((part as any).error));
      }
    }

    const usage = await result.totalUsage;
    return {
      content,
      ...(usage
        ? {
            usage: {
              promptTokens: usage.inputTokens,
              completionTokens: usage.outputTokens,
              totalTokens: usage.inputTokens + usage.outputTokens,
            },
          }
        : {}),
    };
  }

  private buildSystemPrompt(dto: AiGenerateDto): string {
    if (!dto.action) return dto.prompt ?? 'Process the following text.';
    return ACTION_PROMPTS[dto.action]?.(dto.prompt) ?? 'Process the following text.';
  }
}
