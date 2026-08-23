import { ForbiddenException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyTransaction, KyselyDB } from '@docmost/db/types/kysely.types';
import { EntitlementService } from './entitlement.service';

/**
 * Guards usage that creates a tenant-owned resource. Call this inside the same
 * transaction as the write: the advisory lock makes the count-and-insert safe
 * when two requests create spaces for the same workspace concurrently.
 */
@Injectable()
export class UsageLimitService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly entitlementService: EntitlementService,
  ) {}

  async assertCanCreateSpace(
    workspaceId: string,
    trx: KyselyTransaction,
  ): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`.execute(trx);

    const workspace = await trx
      .selectFrom('workspaces')
      .select('plan')
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    const limit = this.entitlementService.getLimits(workspace?.plan).spaces;
    if (limit === null) return;

    const result = await trx
      .selectFrom('spaces')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirstOrThrow();

    if (Number(result.count) >= limit) {
      throw new ForbiddenException(`Your plan supports up to ${limit} spaces`);
    }
  }
}
