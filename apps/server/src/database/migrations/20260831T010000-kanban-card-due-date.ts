import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('kanban_cards')
    .addColumn('due_date', 'date')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('kanban_cards').dropColumn('due_date').execute();
}
