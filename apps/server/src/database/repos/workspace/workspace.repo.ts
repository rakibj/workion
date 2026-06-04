import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  InsertableWorkspace,
  UpdatableWorkspace,
  Workspace,
} from '@docmost/db/types/entity.types';
import { ExpressionBuilder, sql } from 'kysely';
import { DB, Workspaces } from '@docmost/db/types/db';
import {
  CacheKey,
  WORKSPACE_CACHE_TTL_MS,
  MEMBER_COUNT_CACHE_TTL_MS,
} from '../../../common/helpers/cache-keys';
import { withCache } from '../../../common/helpers/with-cache';

@Injectable()
export class WorkspaceRepo {
  public baseFields: Array<keyof Workspaces> = [
    'id',
    'name',
    'description',
    'logo',
    'hostname',
    'customDomain',
    'settings',
    'defaultRole',
    'emailDomains',
    'defaultSpaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'stripeCustomerId',
    'status',
    'billingEmail',
    'trialEndAt',
    'enforceSso',
    'plan',
    'enforceMfa',
    'trashRetentionDays',
    'isScimEnabled',
  ];
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async findById(
    workspaceId: string,
    opts?: {
      withLock?: boolean;
      withMemberCount?: boolean;
      withLicenseKey?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<Workspace> {
    const isBase =
      !opts?.withLock &&
      !opts?.withMemberCount &&
      !opts?.withLicenseKey &&
      !opts?.trx;

    if (isBase) {
      return withCache(
        this.cacheManager,
        CacheKey.WORKSPACE(workspaceId),
        WORKSPACE_CACHE_TTL_MS,
        () => this._findById(workspaceId, opts),
      );
    }
    return this._findById(workspaceId, opts);
  }

  private async _findById(
    workspaceId: string,
    opts?: {
      withLock?: boolean;
      withMemberCount?: boolean;
      withLicenseKey?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, opts?.trx);

    let query = db
      .selectFrom('workspaces')
      .select(this.baseFields)
      .where('id', '=', workspaceId);

    if (opts?.withMemberCount) {
      query = query.select(this.withMemberCount);
    }

    if (opts?.withLicenseKey) {
      query = query.select('licenseKey');
    }

    if (opts?.withLock && opts?.trx) {
      query = query.forUpdate();
    }

    return query.executeTakeFirst();
  }

  async findLicenseKeyById(
    workspaceId: string,
  ): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('workspaces')
      .select('licenseKey')
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    return row?.licenseKey;
  }

  async findFirst(): Promise<Workspace> {
    return await this.db
      .selectFrom('workspaces')
      .selectAll()
      .orderBy('createdAt', 'asc')
      .limit(1)
      .executeTakeFirst();
  }

  async findByHostname(hostname: string): Promise<Workspace> {
    return await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where(sql`LOWER(hostname)`, '=', sql`LOWER(${hostname})`)
      .executeTakeFirst();
  }

  async hostnameExists(
    hostname: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    if (hostname?.length < 1) return false;

    const db = dbOrTx(this.db, trx);
    let { count } = await db
      .selectFrom('workspaces')
      .select((eb) => eb.fn.count('id').as('count'))
      .where(sql`LOWER(hostname)`, '=', sql`LOWER(${hostname})`)
      .executeTakeFirst();
    count = count as number;
    return count != 0;
  }

  async updateWorkspace(
    updatableWorkspace: UpdatableWorkspace,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .updateTable('workspaces')
      .set({ ...updatableWorkspace, updatedAt: new Date() })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
    await this.invalidateWorkspaceCache(workspaceId);
    return result;
  }

  async insertWorkspace(
    insertableWorkspace: InsertableWorkspace,
    trx?: KyselyTransaction,
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('workspaces')
      .values(insertableWorkspace)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async count(): Promise<number> {
    const { count } = await this.db
      .selectFrom('workspaces')
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();
    return count as number;
  }

  withMemberCount(eb: ExpressionBuilder<DB, 'workspaces'>) {
    return eb
      .selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('users.deactivatedAt', 'is', null)
      .where('users.deletedAt', 'is', null)
      .whereRef('users.workspaceId', '=', 'workspaces.id')
      .as('memberCount');
  }

  async getActiveUserCount(workspaceId: string): Promise<number> {
    return withCache(
      this.cacheManager,
      CacheKey.WORKSPACE_MEMBER_COUNT(workspaceId),
      MEMBER_COUNT_CACHE_TTL_MS,
      async () => {
        const users = await this.db
          .selectFrom('users')
          .select(['id', 'deactivatedAt', 'deletedAt'])
          .where('workspaceId', '=', workspaceId)
          .execute();

        const activeUsers = users.filter(
          (user) => user.deletedAt === null && user.deactivatedAt === null,
        );

        return activeUsers.length;
      },
    );
  }

  async invalidateWorkspaceCache(workspaceId: string): Promise<void> {
    await Promise.all([
      this.cacheManager.del(CacheKey.WORKSPACE(workspaceId)),
      this.cacheManager.del(CacheKey.WORKSPACE_MEMBER_COUNT(workspaceId)),
    ]).catch(() => {});
  }

  async updateApiSettings(
    workspaceId: string,
    prefKey: string,
    prefValue: string | boolean,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('api', COALESCE(settings->'api', '{}'::jsonb)
                || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
    await this.invalidateWorkspaceCache(workspaceId);
    return result;
  }

  async updateAiSettings(
    workspaceId: string,
    prefKey: string,
    prefValue: string | boolean,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('ai', COALESCE(settings->'ai', '{}'::jsonb)
                || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
    await this.invalidateWorkspaceCache(workspaceId);
    return result;
  }

  async updateSharingSettings(
    workspaceId: string,
    prefKey: string,
    prefValue: string | boolean,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('sharing', COALESCE(settings->'sharing', '{}'::jsonb)
                || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
    await this.invalidateWorkspaceCache(workspaceId);
    return result;
  }

  async updateTemplateSettings(
    workspaceId: string,
    prefKey: string,
    prefValue: string | boolean,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('templates', COALESCE(settings->'templates', '{}'::jsonb)
                || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
    await this.invalidateWorkspaceCache(workspaceId);
    return result;
  }

}
