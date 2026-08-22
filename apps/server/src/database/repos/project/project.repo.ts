import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertableProject,
  Project,
  UpdatableProject,
} from '../../types/entity.types';

export type ProjectFilters = {
  clientId?: string;
  spaceId?: string;
  status?: string;
};

@Injectable()
export class ProjectRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(
    data: InsertableProject,
    trx?: KyselyTransaction,
  ): Promise<Project> {
    return dbOrTx(this.db, trx)
      .insertInto('projects')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Project | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async list(workspaceId: string, filters: ProjectFilters = {}): Promise<Project[]> {
    let query = this.db
      .selectFrom('projects')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    if (filters.clientId) query = query.where('clientId', '=', filters.clientId);
    if (filters.spaceId) query = query.where('spaceId', '=', filters.spaceId);
    if (filters.status) query = query.where('status', '=', filters.status);

    return query.orderBy('createdAt', 'desc').execute();
  }

  async update(
    id: string,
    workspaceId: string,
    data: UpdatableProject,
    trx?: KyselyTransaction,
  ): Promise<Project | undefined> {
    return dbOrTx(this.db, trx)
      .updateTable('projects')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async archive(id: string, workspaceId: string): Promise<Project | undefined> {
    return this.db
      .updateTable('projects')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .returningAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }
}
