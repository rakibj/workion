import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('space_invite_links')
    .addColumn('client_id', 'uuid', (col) =>
      col.references('clients.id').onDelete('set null'),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('space_invite_links')
    .dropColumn('client_id')
    .execute();
}
