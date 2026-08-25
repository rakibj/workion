import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('blog_post_settings')
    .addColumn('tags', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'::text[]`),
    )
    .addColumn('category', 'varchar')
    .addColumn('featured', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('priority', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createIndex('blog_post_settings_space_id_category_idx')
    .on('blog_post_settings')
    .columns(['space_id', 'category'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('blog_post_settings_space_id_category_idx')
    .execute();

  await db.schema
    .alterTable('blog_post_settings')
    .dropColumn('tags')
    .dropColumn('category')
    .dropColumn('featured')
    .dropColumn('priority')
    .execute();
}
