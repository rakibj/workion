import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('space_invite_links')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').notNull(),
    )
    .addColumn('token', 'varchar', (col) => col.notNull())
    .addColumn('space_role', 'varchar', (col) =>
      col.notNull().defaultTo('none'),
    )
    .addColumn('expires_at', 'timestamptz', (col) => col)
    .addColumn('max_uses', 'integer', (col) => col)
    .addColumn('use_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('disabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('space_invite_links_token_idx')
    .on('space_invite_links')
    .column('token')
    .unique()
    .execute();

  await db.schema
    .createIndex('space_invite_links_space_id_idx')
    .on('space_invite_links')
    .column('space_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('space_invite_links').execute();
}
