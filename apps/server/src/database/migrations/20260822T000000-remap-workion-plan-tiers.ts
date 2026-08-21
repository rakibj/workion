import { type Kysely } from 'kysely';

/**
 * WorkionPlan collapsed from the old 5-tier placeholder set
 * (internal/free/starter/pro/business) to 3 named configs
 * (internal/tenant_basic/tenant_pro) — see docs/specs/done/WORKSPACE_MODULE_CONFIG_SPEC.md.
 * `workspaces.plan` is a plain varchar with no CHECK constraint, so old string
 * values just silently stop matching WorkionPlan and fall back to the most
 * restrictive plan — remap them explicitly instead of relying on that fallback.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('workspaces')
    .set({ plan: 'tenant_basic' })
    .where('plan', 'in', ['free', 'starter'])
    .execute();

  await db
    .updateTable('workspaces')
    .set({ plan: 'tenant_pro' })
    .where('plan', 'in', ['pro', 'business'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('workspaces')
    .set({ plan: 'free' })
    .where('plan', '=', 'tenant_basic')
    .execute();

  await db
    .updateTable('workspaces')
    .set({ plan: 'pro' })
    .where('plan', '=', 'tenant_pro')
    .execute();
}
