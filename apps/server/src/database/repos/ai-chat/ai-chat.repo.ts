import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  AiChat,
  AiChatMessage,
  InsertableAiChat,
  InsertableAiChatMessage,
  UpdatableAiChat,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';

@Injectable()
export class AiChatRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async createChat(
    data: InsertableAiChat,
    trx?: KyselyTransaction,
  ): Promise<AiChat> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('aiChats')
      .values(data)
      .returningAll()
      .executeTakeFirst();
  }

  async findChatById(
    chatId: string,
    workspaceId: string,
  ): Promise<AiChat | undefined> {
    return this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findChatsByUser(
    workspaceId: string,
    userId: string,
    pagination: PaginationOptions,
  ) {
    const query = this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', userId)
      .where('deletedAt', 'is', null);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'createdAt', direction: 'desc' }],
      parseCursor: (cursor) => ({ createdAt: new Date(cursor.createdAt) }),
    });
  }

  async updateChat(
    chatId: string,
    workspaceId: string,
    data: UpdatableAiChat,
    trx?: KyselyTransaction,
  ): Promise<AiChat | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('aiChats')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async softDeleteChat(
    chatId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('aiChats')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async insertMessage(
    data: InsertableAiChatMessage,
    trx?: KyselyTransaction,
  ): Promise<AiChatMessage> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('aiChatMessages')
      .values(data)
      .returning([
        'id',
        'chatId',
        'workspaceId',
        'userId',
        'role',
        'content',
        'toolCalls',
        'metadata',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ])
      .executeTakeFirst();
  }

  async findMessagesByChatId(
    chatId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    const query = this.db
      .selectFrom('aiChatMessages')
      .select([
        'id',
        'chatId',
        'workspaceId',
        'userId',
        'role',
        'content',
        'toolCalls',
        'metadata',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ])
      .where('chatId', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'createdAt', direction: 'asc' }],
      parseCursor: (cursor) => ({ createdAt: new Date(cursor.createdAt) }),
    });
  }

  async searchMessages(
    workspaceId: string,
    userId: string,
    query: string,
    pagination: PaginationOptions,
  ) {
    const tsQuery = this.db
      .selectFrom('aiChatMessages')
      .select([
        'aiChatMessages.id',
        'aiChatMessages.chatId',
        'aiChatMessages.workspaceId',
        'aiChatMessages.userId',
        'aiChatMessages.role',
        'aiChatMessages.content',
        'aiChatMessages.toolCalls',
        'aiChatMessages.metadata',
        'aiChatMessages.createdAt',
        'aiChatMessages.updatedAt',
        'aiChatMessages.deletedAt',
      ])
      .innerJoin('aiChats', 'aiChats.id', 'aiChatMessages.chatId')
      .where('aiChatMessages.workspaceId', '=', workspaceId)
      .where('aiChats.creatorId', '=', userId)
      .where('aiChatMessages.deletedAt', 'is', null)
      .where('aiChats.deletedAt', 'is', null)
      .where(
        'aiChatMessages.tsv',
        '@@',
        sql<string>`websearch_to_tsquery('english', ${query})`,
      );

    return executeWithCursorPagination(tsQuery, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'createdAt', direction: 'desc' }],
      parseCursor: (cursor) => ({ createdAt: new Date(cursor.createdAt) }),
    });
  }
}
