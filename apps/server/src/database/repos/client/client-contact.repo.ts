import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { dbOrTx } from '@docmost/db/utils';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import {
  ClientContact,
  InsertableClientContact,
  UpdatableClientContact,
} from '../../types/entity.types';

@Injectable()
export class ClientContactRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(
    data: InsertableClientContact,
    trx?: KyselyTransaction,
  ): Promise<ClientContact> {
    return dbOrTx(this.db, trx)
      .insertInto('clientContacts')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async createGuestInvite(
    data: InsertableClientContact,
    trx?: KyselyTransaction,
  ): Promise<ClientContact | undefined> {
    return dbOrTx(this.db, trx)
      .insertInto('clientContacts')
      .values(data)
      .onConflict((oc) =>
        oc
          .columns(['clientId', 'userId'])
          .where('userId', 'is not', null)
          .where('deletedAt', 'is', null)
          .doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
  }

  async findByClientId(
    clientId: string,
    workspaceId: string,
  ): Promise<ClientContact[]> {
    return this.db
      .selectFrom('clientContacts')
      .selectAll()
      .where('clientId', '=', clientId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('isPrimary', 'desc')
      .orderBy('createdAt', 'asc')
      .execute();
  }

  async findById(
    id: string,
    clientId: string,
    workspaceId: string,
  ): Promise<ClientContact | undefined> {
    return this.db
      .selectFrom('clientContacts')
      .selectAll()
      .where('id', '=', id)
      .where('clientId', '=', clientId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByEmail(
    clientId: string,
    workspaceId: string,
    email: string,
    trx?: KyselyTransaction,
  ): Promise<ClientContact | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('clientContacts')
      .selectAll()
      .where('clientId', '=', clientId)
      .where('workspaceId', '=', workspaceId)
      .where(sql`LOWER(email)`, '=', sql`LOWER(${email})`)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByUserId(
    clientId: string,
    workspaceId: string,
    userId: string,
    trx?: KyselyTransaction,
  ): Promise<ClientContact | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('clientContacts')
      .selectAll()
      .where('clientId', '=', clientId)
      .where('workspaceId', '=', workspaceId)
      .where('userId', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async update(
    id: string,
    clientId: string,
    workspaceId: string,
    data: UpdatableClientContact,
    trx?: KyselyTransaction,
  ): Promise<ClientContact | undefined> {
    return dbOrTx(this.db, trx)
      .updateTable('clientContacts')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .where('clientId', '=', clientId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async archive(
    id: string,
    clientId: string,
    workspaceId: string,
  ): Promise<ClientContact | undefined> {
    return this.update(id, clientId, workspaceId, { deletedAt: new Date() });
  }
}
