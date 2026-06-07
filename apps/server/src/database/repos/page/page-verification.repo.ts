import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../types/kysely.types';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import {
  InsertablePageVerification,
  UpdatablePageVerification,
} from '@docmost/db/types/entity.types';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';

export type VerificationListParams = {
  spaceIds?: string[];
  verifierId?: string;
  type?: string;
  cursor?: string;
  beforeCursor?: string;
  limit?: number;
  query?: string;
};

@Injectable()
export class PageVerificationRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByPageId(pageId: string) {
    return this.db
      .selectFrom('pageVerifications')
      .selectAll('pageVerifications')
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom('pageVerifiers')
            .innerJoin('users', 'users.id', 'pageVerifiers.userId')
            .select([
              'users.id',
              'users.name',
              'users.email',
              'users.avatarUrl',
            ])
            .whereRef(
              'pageVerifiers.pageVerificationId',
              '=',
              'pageVerifications.id',
            ),
        ).as('verifiers'),
      )
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef('users.id', '=', 'pageVerifications.verifiedById'),
        ).as('verifiedBy'),
      )
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef('users.id', '=', 'pageVerifications.requestedById'),
        ).as('requestedBy'),
      )
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef('users.id', '=', 'pageVerifications.rejectedById'),
        ).as('rejectedBy'),
      )
      .where('pageVerifications.pageId', '=', pageId)
      .executeTakeFirst();
  }

  async create(
    data: InsertablePageVerification,
    verifierIds: string[],
    addedById: string,
  ) {
    return this.db.transaction().execute(async (trx) => {
      const verification = await trx
        .insertInto('pageVerifications')
        .values(data)
        .returningAll()
        .executeTakeFirst();

      if (verifierIds.length > 0) {
        await trx
          .insertInto('pageVerifiers')
          .values(
            verifierIds.map((userId) => ({
              pageVerificationId: verification.id,
              userId,
              addedById,
            })),
          )
          .execute();
      }

      return verification;
    });
  }

  async update(verificationId: string, data: UpdatablePageVerification) {
    return this.db
      .updateTable('pageVerifications')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', verificationId)
      .returningAll()
      .executeTakeFirst();
  }

  async replaceVerifiers(
    verificationId: string,
    verifierIds: string[],
    addedById: string,
  ) {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('pageVerifiers')
        .where('pageVerificationId', '=', verificationId)
        .execute();

      if (verifierIds.length > 0) {
        await trx
          .insertInto('pageVerifiers')
          .values(
            verifierIds.map((userId) => ({
              pageVerificationId: verificationId,
              userId,
              addedById,
            })),
          )
          .execute();
      }
    });
  }

  async deleteByPageId(pageId: string) {
    await this.db
      .deleteFrom('pageVerifications')
      .where('pageId', '=', pageId)
      .execute();
  }

  async findList(workspaceId: string, params: VerificationListParams) {
    let query = this.db
      .selectFrom('pageVerifications')
      .selectAll('pageVerifications')
      .innerJoin('pages', 'pages.id', 'pageVerifications.pageId')
      .innerJoin('spaces', 'spaces.id', 'pageVerifications.spaceId')
      .select([
        'pages.title as pageTitle',
        'pages.slugId as pageSlugId',
        'pages.icon as pageIcon',
        'spaces.name as spaceName',
        'spaces.slug as spaceSlug',
      ])
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom('pageVerifiers')
            .innerJoin('users', 'users.id', 'pageVerifiers.userId')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef(
              'pageVerifiers.pageVerificationId',
              '=',
              'pageVerifications.id',
            ),
        ).as('verifiers'),
      )
      .where('pageVerifications.workspaceId', '=', workspaceId)
      .where('pages.deletedAt', 'is', null);

    if (params.spaceIds?.length) {
      query = query.where('pageVerifications.spaceId', 'in', params.spaceIds);
    }

    if (params.type) {
      query = query.where('pageVerifications.type', '=', params.type);
    }

    if (params.query) {
      query = query.where('pages.title', 'ilike', `%${params.query}%`);
    }

    if (params.verifierId) {
      const verifierId = params.verifierId;
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('pageVerifiers')
            .select('pageVerifiers.id')
            .whereRef(
              'pageVerifiers.pageVerificationId',
              '=',
              'pageVerifications.id',
            )
            .where('pageVerifiers.userId', '=', verifierId),
        ),
      );
    }

    return executeWithCursorPagination(query, {
      perPage: params.limit ?? 20,
      cursor: params.cursor,
      beforeCursor: params.beforeCursor,
      fields: [{ expression: 'pageVerifications.id', direction: 'desc' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }
}
