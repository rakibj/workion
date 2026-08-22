import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { sql } from 'kysely';
import {
  BlogPostSettings,
  InsertableBlogPostSettings,
} from '@docmost/db/types/entity.types';

@Injectable()
export class BlogPostSettingsRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByPageId(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<BlogPostSettings | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('blogPostSettings')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  async findBySlugInSpace(
    spaceId: string,
    slug: string,
    trx?: KyselyTransaction,
  ): Promise<BlogPostSettings | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('blogPostSettings')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('slug', '=', slug)
      .executeTakeFirst();
  }

  async upsert(
    settings: InsertableBlogPostSettings,
    trx?: KyselyTransaction,
  ): Promise<BlogPostSettings> {
    return dbOrTx(this.db, trx)
      .insertInto('blogPostSettings')
      .values(settings)
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({
          slug: settings.slug,
          metaTitle: settings.metaTitle ?? null,
          metaDescription: settings.metaDescription ?? null,
          ogImageAttachmentId: settings.ogImageAttachmentId ?? null,
          canonicalUrl: settings.canonicalUrl ?? null,
          robotsIndex: settings.robotsIndex ?? true,
          robotsFollow: settings.robotsFollow ?? true,
          focusKeyword: settings.focusKeyword ?? null,
          customFields: settings.customFields ?? {},
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findSpaceByBlogDomain(domain: string) {
    return this.db
      .selectFrom('spaces')
      .innerJoin('workspaces', 'workspaces.id', 'spaces.workspaceId')
      .selectAll()
      .select('workspaces.plan as workspacePlan')
      .where(sql`LOWER(settings->'blog'->>'domain')`, '=', domain.toLowerCase())
      .executeTakeFirst();
  }

  async findSpaceById(spaceId: string) {
    return this.db
      .selectFrom('spaces')
      .innerJoin('workspaces', 'workspaces.id', 'spaces.workspaceId')
      .selectAll()
      .select('workspaces.plan as workspacePlan')
      .where('id', '=', spaceId)
      .executeTakeFirst();
  }

  async findPublishedBySlug(spaceId: string, slug: string) {
    return this.basePublishedQuery(spaceId)
      .where('blogPostSettings.slug', '=', slug)
      .executeTakeFirst();
  }

  async findPublishedBySlugAnywhere(slug: string) {
    return this.basePublishedQuery()
      .where('blogPostSettings.slug', '=', slug)
      .executeTakeFirst();
  }

  async listPublished(spaceId: string, limit: number, offset: number) {
    return this.basePublishedQuery(spaceId)
      .orderBy('shares.createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();
  }

  async listPublishedAnywhere(limit: number, offset: number) {
    return this.basePublishedQuery()
      .orderBy('shares.createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();
  }

  async listAllPublished(spaceId: string) {
    return this.basePublishedQuery(spaceId)
      .orderBy('shares.createdAt', 'desc')
      .execute();
  }

  async listAllPublishedAnywhere() {
    return this.basePublishedQuery()
      .orderBy('shares.createdAt', 'desc')
      .execute();
  }

  async findPublishedByPageId(pageId: string) {
    return this.basePublishedQuery()
      .where('pages.id', '=', pageId)
      .executeTakeFirst();
  }

  private basePublishedQuery(spaceId?: string) {
    return this.db
      .selectFrom('blogPostSettings')
      .innerJoin('pages', 'pages.id', 'blogPostSettings.pageId')
      .innerJoin('shares', 'shares.pageId', 'pages.id')
      .innerJoin('workspaces', 'workspaces.id', 'pages.workspaceId')
      .leftJoin('users', 'users.id', 'pages.creatorId')
      .select([
        'pages.id as pageId',
        'pages.workspaceId',
        'workspaces.plan as workspacePlan',
        'pages.title',
        'pages.content',
        'pages.updatedAt',
        'blogPostSettings.slug',
        'blogPostSettings.metaTitle',
        'blogPostSettings.metaDescription',
        'blogPostSettings.ogImageAttachmentId',
        'blogPostSettings.canonicalUrl',
        'blogPostSettings.robotsIndex',
        'blogPostSettings.robotsFollow',
        'blogPostSettings.focusKeyword',
        'blogPostSettings.customFields',
        'shares.createdAt as publishedAt',
        'users.name as authorName',
      ])
      .$if(Boolean(spaceId), (qb) =>
        qb.where('blogPostSettings.spaceId', '=', spaceId),
      )
      .where('pages.type', '=', 'blog')
      .where('pages.deletedAt', 'is', null)
      .where('shares.deletedAt', 'is', null);
  }
}
