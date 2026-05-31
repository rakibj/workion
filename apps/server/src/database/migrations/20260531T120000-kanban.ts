import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Add page type discriminator
  await db.schema
    .alterTable('pages')
    .addColumn('type', 'varchar', (col) =>
      col.notNull().defaultTo('document'),
    )
    .execute();

  await db.schema
    .createTable('kanban_columns')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('color', 'varchar', (col) => col.notNull().defaultTo('gray'))
    .addColumn('position', 'double precision', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('kanban_columns_page_id_idx')
    .on('kanban_columns')
    .column('page_id')
    .execute();

  await db.schema
    .createTable('kanban_cards')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('column_id', 'uuid', (col) =>
      col.references('kanban_columns.id').onDelete('cascade').notNull(),
    )
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('position', 'double precision', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('kanban_cards_column_id_idx')
    .on('kanban_cards')
    .column('column_id')
    .execute();

  await db.schema
    .createTable('kanban_card_assignees')
    .addColumn('card_id', 'uuid', (col) =>
      col.references('kanban_cards.id').onDelete('cascade').notNull(),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade').notNull(),
    )
    .execute();

  await db.schema
    .alterTable('kanban_card_assignees')
    .addPrimaryKeyConstraint('kanban_card_assignees_pkey', ['card_id', 'user_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('kanban_card_assignees').execute();
  await db.schema.dropTable('kanban_cards').execute();
  await db.schema.dropTable('kanban_columns').execute();
  await db.schema.alterTable('pages').dropColumn('type').execute();
}
