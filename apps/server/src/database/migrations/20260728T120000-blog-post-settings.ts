import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('blog_post_settings')
    .addColumn('page_id', 'uuid', (col) =>
      col.primaryKey().references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) => col.notNull())
    .addColumn('slug', 'varchar', (col) => col.notNull())
    .addColumn('meta_title', 'varchar')
    .addColumn('meta_description', 'text')
    .addColumn('og_image_attachment_id', 'uuid', (col) =>
      col.references('attachments.id').onDelete('set null'),
    )
    .addColumn('canonical_url', 'varchar')
    .addColumn('robots_index', 'boolean', (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn('robots_follow', 'boolean', (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn('focus_keyword', 'varchar')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('blog_post_settings_space_id_slug_idx')
    .on('blog_post_settings')
    .columns(['space_id', 'slug'])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('blog_post_settings').execute();
}
