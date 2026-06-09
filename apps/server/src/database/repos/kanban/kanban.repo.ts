import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import {
  InsertableKanbanCard,
  InsertableKanbanColumn,
  KanbanCard,
  KanbanCardAssignee,
  KanbanColumn,
} from '../../types/entity.types';
import { dbOrTx } from '@docmost/db/utils';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import {
  InsertableKanbanMilestone,
  KanbanMilestone,
} from '../../types/entity.types';

export interface KanbanCardWithAssignees extends KanbanCard {
  assignees: { userId: string; name: string; avatarUrl: string | null }[];
  milestone: { id: string; name: string; dueDate: string } | null;
}

export interface KanbanColumnWithCards extends KanbanColumn {
  cards: KanbanCardWithAssignees[];
}

@Injectable()
export class KanbanRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  // ─── Board ────────────────────────────────────────────────────────────────

  async getBoardByPageId(pageId: string): Promise<KanbanColumnWithCards[]> {
    const columns = await this.db
      .selectFrom('kanbanColumns')
      .selectAll()
      .where('pageId', '=', pageId)
      .orderBy('position', 'asc')
      .execute();

    if (columns.length === 0) return [];

    const columnIds = columns.map((c) => c.id);

    const cards = await this.db
      .selectFrom('kanbanCards')
      .selectAll()
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom('kanbanCardAssignees')
            .innerJoin('users', 'users.id', 'kanbanCardAssignees.userId')
            .select([
              'kanbanCardAssignees.userId',
              'users.name',
              'users.avatarUrl',
            ])
            .whereRef(
              'kanbanCardAssignees.cardId',
              '=',
              'kanbanCards.id',
            ),
        ).as('assignees'),
        jsonObjectFrom(
          eb
            .selectFrom('kanbanMilestones')
            .select(['id', 'name', 'dueDate'])
            .whereRef('kanbanMilestones.id', '=', 'kanbanCards.milestoneId'),
        ).as('milestone'),
      ])
      .where('columnId', 'in', columnIds)
      .orderBy('position', 'asc')
      .execute();

    const cardsByColumn = new Map<string, KanbanCardWithAssignees[]>();
    for (const card of cards) {
      const list = cardsByColumn.get(card.columnId) ?? [];
      list.push(card as KanbanCardWithAssignees);
      cardsByColumn.set(card.columnId, list);
    }

    return columns.map((col) => ({
      ...col,
      cards: cardsByColumn.get(col.id) ?? [],
    }));
  }

  // ─── Columns ──────────────────────────────────────────────────────────────

  async findColumnById(
    id: string,
    trx?: KyselyTransaction,
  ): Promise<KanbanColumn | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('kanbanColumns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async createColumn(
    data: InsertableKanbanColumn,
    trx?: KyselyTransaction,
  ): Promise<KanbanColumn> {
    return dbOrTx(this.db, trx)
      .insertInto('kanbanColumns')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateColumn(
    id: string,
    data: Partial<Pick<KanbanColumn, 'name' | 'color' | 'position'>>,
    trx?: KyselyTransaction,
  ): Promise<KanbanColumn> {
    return dbOrTx(this.db, trx)
      .updateTable('kanbanColumns')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteColumn(id: string, trx?: KyselyTransaction): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('kanbanColumns')
      .where('id', '=', id)
      .execute();
  }

  async getMaxColumnPosition(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const result = await dbOrTx(this.db, trx)
      .selectFrom('kanbanColumns')
      .select((eb) => eb.fn.max('position').as('maxPos'))
      .where('pageId', '=', pageId)
      .executeTakeFirst();
    return (result?.maxPos as number) ?? 0;
  }

  // ─── Cards ────────────────────────────────────────────────────────────────

  async findCardById(
    id: string,
    trx?: KyselyTransaction,
  ): Promise<KanbanCard | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('kanbanCards')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async createCard(
    data: InsertableKanbanCard,
    trx?: KyselyTransaction,
  ): Promise<KanbanCard> {
    return dbOrTx(this.db, trx)
      .insertInto('kanbanCards')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateCard(
    id: string,
    data: Partial<Pick<KanbanCard, 'title' | 'description' | 'priority' | 'milestoneId' | 'position' | 'columnId'>>,
    trx?: KyselyTransaction,
  ): Promise<KanbanCard> {
    return dbOrTx(this.db, trx)
      .updateTable('kanbanCards')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteCard(id: string, trx?: KyselyTransaction): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('kanbanCards')
      .where('id', '=', id)
      .execute();
  }

  async getMaxCardPosition(
    columnId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const result = await dbOrTx(this.db, trx)
      .selectFrom('kanbanCards')
      .select((eb) => eb.fn.max('position').as('maxPos'))
      .where('columnId', '=', columnId)
      .executeTakeFirst();
    return (result?.maxPos as number) ?? 0;
  }

  // ─── Assignees ────────────────────────────────────────────────────────────

  async addAssignee(
    cardId: string,
    userId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .insertInto('kanbanCardAssignees')
      .values({ cardId, userId })
      .onConflict((oc) => oc.columns(['cardId', 'userId']).doNothing())
      .execute();
  }

  async removeAssignee(
    cardId: string,
    userId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('kanbanCardAssignees')
      .where('cardId', '=', cardId)
      .where('userId', '=', userId)
      .execute();
  }

  async removeAssigneesByUsersAndPage(
    userIds: string[],
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (userIds.length === 0) return;
    await dbOrTx(this.db, trx)
      .deleteFrom('kanbanCardAssignees')
      .where('userId', 'in', userIds)
      .where('cardId', 'in', (qb) =>
        qb
          .selectFrom('kanbanCards')
          .select('kanbanCards.id')
          .innerJoin('kanbanColumns', 'kanbanColumns.id', 'kanbanCards.columnId')
          .where('kanbanColumns.pageId', '=', pageId),
      )
      .execute();
  }

  async removeAssigneesByUsersAndSpace(
    userIds: string[],
    spaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (userIds.length === 0) return;
    await dbOrTx(this.db, trx)
      .deleteFrom('kanbanCardAssignees')
      .where('userId', 'in', userIds)
      .where('cardId', 'in', (qb) =>
        qb
          .selectFrom('kanbanCards')
          .select('kanbanCards.id')
          .innerJoin('kanbanColumns', 'kanbanColumns.id', 'kanbanCards.columnId')
          .innerJoin('pages', 'pages.id', 'kanbanColumns.pageId')
          .where('pages.spaceId', '=', spaceId),
      )
      .execute();
  }

  async getAssignees(
    cardId: string,
  ): Promise<{ userId: string; name: string; avatarUrl: string | null }[]> {
    return this.db
      .selectFrom('kanbanCardAssignees')
      .innerJoin('users', 'users.id', 'kanbanCardAssignees.userId')
      .select(['kanbanCardAssignees.userId', 'users.name', 'users.avatarUrl'])
      .where('kanbanCardAssignees.cardId', '=', cardId)
      .execute();
  }

  // ─── Milestones ───────────────────────────────────────────────────────────

  async findMilestoneById(id: string): Promise<KanbanMilestone | undefined> {
    return this.db
      .selectFrom('kanbanMilestones')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async getMilestonesByPageId(pageId: string): Promise<KanbanMilestone[]> {
    return this.db
      .selectFrom('kanbanMilestones')
      .selectAll()
      .where('pageId', '=', pageId)
      .orderBy('dueDate', 'asc')
      .execute();
  }

  async createMilestone(
    data: InsertableKanbanMilestone,
  ): Promise<KanbanMilestone> {
    return this.db
      .insertInto('kanbanMilestones')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateMilestone(
    id: string,
    data: Partial<Pick<KanbanMilestone, 'name' | 'dueDate'>>,
  ): Promise<KanbanMilestone> {
    return this.db
      .updateTable('kanbanMilestones')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteMilestone(id: string): Promise<void> {
    await this.db
      .deleteFrom('kanbanMilestones')
      .where('id', '=', id)
      .execute();
  }
}
