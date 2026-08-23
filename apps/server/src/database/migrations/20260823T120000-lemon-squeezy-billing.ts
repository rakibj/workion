import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .addColumn('lemon_squeezy_customer_id', 'varchar', (col) => col)
    .execute();

  await db.schema
    .alterTable('workspaces')
    .addUniqueConstraint('workspaces_lemon_squeezy_customer_id_unique', [
      'lemon_squeezy_customer_id',
    ])
    .execute();

  await db.schema
    .alterTable('billing')
    .addColumn('lemon_squeezy_subscription_id', 'varchar', (col) => col)
    .addColumn('lemon_squeezy_customer_id', 'varchar', (col) => col)
    .addColumn('lemon_squeezy_product_id', 'varchar', (col) => col)
    .addColumn('lemon_squeezy_variant_id', 'varchar', (col) => col)
    .addColumn('customer_portal_url', 'text', (col) => col)
    .addColumn('update_payment_method_url', 'text', (col) => col)
    .execute();

  await db.schema
    .alterTable('billing')
    .addUniqueConstraint('billing_lemon_squeezy_subscription_id_unique', [
      'lemon_squeezy_subscription_id',
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('billing')
    .dropConstraint('billing_lemon_squeezy_subscription_id_unique')
    .execute();

  await db.schema
    .alterTable('billing')
    .dropColumn('update_payment_method_url')
    .dropColumn('customer_portal_url')
    .dropColumn('lemon_squeezy_variant_id')
    .dropColumn('lemon_squeezy_product_id')
    .dropColumn('lemon_squeezy_customer_id')
    .dropColumn('lemon_squeezy_subscription_id')
    .execute();

  await db.schema
    .alterTable('workspaces')
    .dropConstraint('workspaces_lemon_squeezy_customer_id_unique')
    .execute();

  await db.schema
    .alterTable('workspaces')
    .dropColumn('lemon_squeezy_customer_id')
    .execute();
}
