import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('kanban_categories')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('icon', 'varchar', (col) => col.notNull())
    .addColumn('position', 'double precision', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('kanban_categories_page_id_idx')
    .on('kanban_categories')
    .column('page_id')
    .execute();

  await db.schema
    .createTable('kanban_category_options')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('category_id', 'uuid', (col) =>
      col.references('kanban_categories.id').onDelete('cascade').notNull(),
    )
    .addColumn('label', 'varchar', (col) => col.notNull())
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
    .createIndex('kanban_category_options_category_id_idx')
    .on('kanban_category_options')
    .column('category_id')
    .execute();

  await db.schema
    .createTable('kanban_card_category_values')
    .addColumn('card_id', 'uuid', (col) =>
      col.references('kanban_cards.id').onDelete('cascade').notNull(),
    )
    .addColumn('category_id', 'uuid', (col) =>
      col.references('kanban_categories.id').onDelete('cascade').notNull(),
    )
    .addColumn('option_id', 'uuid', (col) =>
      col.references('kanban_category_options.id').onDelete('cascade').notNull(),
    )
    .execute();

  await db.schema
    .alterTable('kanban_card_category_values')
    .addPrimaryKeyConstraint('kanban_card_category_values_pkey', [
      'card_id',
      'category_id',
    ])
    .execute();

  await db.schema
    .createIndex('kanban_card_category_values_option_id_idx')
    .on('kanban_card_category_values')
    .column('option_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('kanban_card_category_values').execute();
  await db.schema.dropTable('kanban_category_options').execute();
  await db.schema.dropTable('kanban_categories').execute();
}
