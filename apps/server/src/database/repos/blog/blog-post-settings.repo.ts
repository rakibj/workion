import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
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
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
