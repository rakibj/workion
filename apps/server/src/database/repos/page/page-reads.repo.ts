import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

@Injectable()
export class PageReadsRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async upsert(userId: string, pageId: string): Promise<void> {
    await this.db
      .insertInto('pageReads')
      .values({ userId, pageId })
      .onConflict((oc) =>
        oc.columns(['userId', 'pageId']).doUpdateSet({ lastReadAt: new Date() }),
      )
      .execute();
  }

  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .selectFrom('notifications')
      .leftJoin('pageReads', (join) =>
        join
          .onRef('pageReads.userId', '=', 'notifications.userId')
          .onRef('pageReads.pageId', '=', 'notifications.pageId'),
      )
      .select([
        'notifications.pageId',
        (eb) => eb.fn.countAll<string>().as('count'),
      ])
      .where('notifications.userId', '=', userId)
      .where('notifications.pageId', 'is not', null)
      .where((eb) =>
        eb.or([
          eb('pageReads.lastReadAt', 'is', null),
          eb('notifications.createdAt', '>', eb.ref('pageReads.lastReadAt')),
        ]),
      )
      .groupBy('notifications.pageId')
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      if (row.pageId) result[row.pageId] = Number(row.count);
    }
    return result;
  }

  async getUnreadCount(userId: string, pageId: string): Promise<number> {
    const row = await this.db
      .selectFrom('notifications')
      .leftJoin('pageReads', (join) =>
        join
          .onRef('pageReads.userId', '=', 'notifications.userId')
          .onRef('pageReads.pageId', '=', 'notifications.pageId'),
      )
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('notifications.userId', '=', userId)
      .where('notifications.pageId', '=', pageId)
      .where((eb) =>
        eb.or([
          eb('pageReads.lastReadAt', 'is', null),
          eb('notifications.createdAt', '>', eb.ref('pageReads.lastReadAt')),
        ]),
      )
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }
}
