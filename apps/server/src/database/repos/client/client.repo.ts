import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  Client,
  ClientSpace,
  InsertableClient,
  InsertableClientSpace,
  Space,
  UpdatableClient,
} from '../../types/entity.types';

@Injectable()
export class ClientRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(
    data: InsertableClient,
    trx?: KyselyTransaction,
  ): Promise<Client> {
    return dbOrTx(this.db, trx)
      .insertInto('clients')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Client | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('clients')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findVisibleToUser(userId: string, workspaceId: string): Promise<Client[]> {
    return this.db
      .selectFrom('clients')
      .innerJoin('clientSpaces', 'clientSpaces.clientId', 'clients.id')
      .innerJoin('spaces', 'spaces.id', 'clientSpaces.spaceId')
      .innerJoin('spaceMembers', 'spaceMembers.spaceId', 'spaces.id')
      .leftJoin('groupUsers', 'groupUsers.groupId', 'spaceMembers.groupId')
      .selectAll('clients')
      .where('clients.workspaceId', '=', workspaceId)
      .where('clients.deletedAt', 'is', null)
      .where('spaces.deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('spaceMembers.userId', '=', userId),
          eb('groupUsers.userId', '=', userId),
        ]),
      )
      .distinct()
      .execute();
  }

  async update(
    id: string,
    workspaceId: string,
    data: UpdatableClient,
    trx?: KyselyTransaction,
  ): Promise<Client | undefined> {
    return dbOrTx(this.db, trx)
      .updateTable('clients')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async archive(id: string, workspaceId: string): Promise<Client | undefined> {
    return this.db
      .updateTable('clients')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .returningAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async linkSpace(
    data: InsertableClientSpace,
    trx?: KyselyTransaction,
  ): Promise<ClientSpace | undefined> {
    return dbOrTx(this.db, trx)
      .insertInto('clientSpaces')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['clientId', 'spaceId']).doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
  }

  async unlinkSpace(
    clientId: string,
    spaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('clientSpaces')
      .where('clientId', '=', clientId)
      .where('spaceId', '=', spaceId)
      .execute();
  }

  async getLinkedSpaces(clientId: string): Promise<Space[]> {
    return this.db
      .selectFrom('clientSpaces')
      .innerJoin('spaces', 'spaces.id', 'clientSpaces.spaceId')
      .selectAll('spaces')
      .where('clientSpaces.clientId', '=', clientId)
      .where('spaces.deletedAt', 'is', null)
      .execute();
  }

  async isSpaceLinked(clientId: string, spaceId: string): Promise<boolean> {
    const link = await this.db
      .selectFrom('clientSpaces')
      .select('id')
      .where('clientId', '=', clientId)
      .where('spaceId', '=', spaceId)
      .executeTakeFirst();
    return Boolean(link);
  }
}
