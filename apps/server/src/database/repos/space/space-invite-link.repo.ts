import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertableSpaceInviteLink,
  SpaceInviteLink,
} from '@docmost/db/types/entity.types';

@Injectable()
export class SpaceInviteLinkRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByToken(token: string): Promise<SpaceInviteLink & { spaceName: string; workspaceName: string } | undefined> {
    return this.db
      .selectFrom('spaceInviteLinks')
      .innerJoin('spaces', 'spaces.id', 'spaceInviteLinks.spaceId')
      .innerJoin('workspaces', 'workspaces.id', 'spaceInviteLinks.workspaceId')
      .selectAll('spaceInviteLinks')
      .select(['spaces.name as spaceName', 'spaces.description as spaceDescription', 'workspaces.name as workspaceName'])
      .where('spaceInviteLinks.token', '=', token)
      .executeTakeFirst() as any;
  }

  async findById(id: string, workspaceId: string): Promise<SpaceInviteLink | undefined> {
    return this.db
      .selectFrom('spaceInviteLinks')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findBySpaceId(spaceId: string, workspaceId: string): Promise<SpaceInviteLink[]> {
    return this.db
      .selectFrom('spaceInviteLinks')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async insert(link: InsertableSpaceInviteLink, trx?: KyselyTransaction): Promise<SpaceInviteLink> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('spaceInviteLinks')
      .values(link)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async incrementUseCount(id: string, trx?: KyselyTransaction): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('spaceInviteLinks')
      .set((eb) => ({ useCount: eb('useCount', '+', 1), updatedAt: new Date() }))
      .where('id', '=', id)
      .execute();
  }

  async deleteById(id: string, workspaceId: string): Promise<void> {
    await this.db
      .deleteFrom('spaceInviteLinks')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}
