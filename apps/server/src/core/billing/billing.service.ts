import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkionPlan } from '../../common/entitlement/entitlement';

const PLAN_DEFINITIONS = [
  {
    id: WorkionPlan.TENANT_BASIC,
    name: 'Solo Founder',
    description: 'For solo founders managing a small client workspace.',
    features: ['Up to 3 spaces', '1 client', 'Up to 3 users'],
    price: { monthly: '9', yearly: null },
  },
  {
    id: WorkionPlan.TENANT_PRO,
    name: 'Startup',
    description: 'For an early team with more active client work.',
    features: ['Up to 10 spaces', 'Up to 10 clients', 'Up to 10 users'],
    price: { monthly: '19', yearly: null },
  },
] as const;

@Injectable()
export class BillingService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
  ) {}

  getPlans() {
    const variants = this.environmentService.getLemonSqueezyVariantIds();
    return PLAN_DEFINITIONS.map((plan) => ({
      ...plan,
      monthlyId: variants[plan.id].monthly || null,
      yearlyId: variants[plan.id].yearly || null,
    }));
  }

  async createCheckout(workspace: Workspace, user: User, variantId: string) {
    const plan = this.findPlanByVariant(variantId);
    const apiKey = this.environmentService.getLemonSqueezyApiKey();
    const storeId = this.environmentService.getLemonSqueezyStoreId();
    if (!apiKey || !storeId) {
      throw new BadRequestException('Billing is not configured yet');
    }

    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: user.email,
              custom: { workspace_id: workspace.id, plan: plan.id },
            },
            product_options: {
              redirect_url: `${this.environmentService.getAppUrl()}/settings/billing?checkout=success`,
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: storeId } },
            variant: { data: { type: 'variants', id: variantId } },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new BadRequestException('Unable to create a Lemon Squeezy checkout');
    }
    const payload = await response.json();
    return { url: payload.data.attributes.url };
  }

  async getPortal(workspaceId: string) {
    const billing = await this.db
      .selectFrom('billing')
      .select('customerPortalUrl' as any)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('updatedAt', 'desc')
      .executeTakeFirst();
    if (!billing?.customerPortalUrl) {
      throw new BadRequestException('No active subscription was found');
    }
    return { url: billing.customerPortalUrl };
  }

  async handleWebhook(rawBody: Buffer | string | undefined, signature?: string) {
    const secret = this.environmentService.getLemonSqueezyWebhookSecret();
    if (!rawBody || !secret || !signature || !this.isValidSignature(rawBody, secret, signature)) {
      throw new UnauthorizedException('Invalid Lemon Squeezy signature');
    }

    const payload = JSON.parse(rawBody.toString());
    const eventName = payload?.meta?.event_name;
    if (!eventName?.startsWith('subscription_')) return;

    const attributes = payload?.data?.attributes;
    const workspaceId = payload?.meta?.custom_data?.workspace_id;
    const subscriptionId = String(payload?.data?.id || '');
    if (!attributes || !workspaceId || !subscriptionId) {
      throw new BadRequestException('Webhook is missing subscription data');
    }

    const plan = this.findPlanByVariant(String(attributes.variant_id));
    const status = this.resolveWorkspaceStatus(eventName, attributes.status);
    const now = new Date();
    const record = {
      stripeSubscriptionId: `ls_${subscriptionId}`,
      status,
      periodStartAt: new Date(attributes.created_at || now),
      periodEndAt: attributes.renews_at ? new Date(attributes.renews_at) : null,
      cancelAtPeriodEnd: Boolean(attributes.cancelled),
      cancelAt: attributes.ends_at ? new Date(attributes.ends_at) : null,
      canceledAt: attributes.cancelled ? now : null,
      endedAt: attributes.ends_at ? new Date(attributes.ends_at) : null,
      workspaceId,
      lemonSqueezySubscriptionId: subscriptionId,
      lemonSqueezyCustomerId: String(attributes.customer_id),
      lemonSqueezyProductId: String(attributes.product_id),
      lemonSqueezyVariantId: String(attributes.variant_id),
      customerPortalUrl: attributes.urls?.customer_portal || null,
      updatePaymentMethodUrl: attributes.urls?.update_payment_method || null,
      updatedAt: now,
    };

    await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('billing')
        .select('id')
        .where('lemonSqueezySubscriptionId' as any, '=', subscriptionId)
        .executeTakeFirst();

      if (existing) {
        await trx.updateTable('billing').set(record as any).where('id', '=', existing.id).execute();
      } else {
        await trx.insertInto('billing').values(record as any).execute();
      }

      const effectivePlan = ['expired', 'past_due', 'unpaid'].includes(status)
        ? WorkionPlan.TENANT_BASIC
        : plan.id;
      await trx
        .updateTable('workspaces')
        .set({
          plan: effectivePlan,
          status,
          lemonSqueezyCustomerId: String(attributes.customer_id),
          updatedAt: now,
        } as any)
        .where('id', '=', workspaceId)
        .execute();
    });
  }

  private findPlanByVariant(variantId: string) {
    const variants = this.environmentService.getLemonSqueezyVariantIds();
    const plan = PLAN_DEFINITIONS.find(
      (candidate) =>
        variants[candidate.id].monthly === variantId || variants[candidate.id].yearly === variantId,
    );
    if (!plan) throw new BadRequestException('Unknown billing variant');
    return plan;
  }

  private resolveWorkspaceStatus(eventName: string, status?: string) {
    if (eventName === 'subscription_expired') return 'expired';
    if (eventName === 'subscription_payment_failed') return 'past_due';
    if (eventName === 'subscription_cancelled') return 'cancelled';
    return status || 'active';
  }

  private isValidSignature(rawBody: Buffer | string, secret: string, signature: string) {
    const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expected = Buffer.from(digest, 'utf8');
    const received = Buffer.from(signature, 'utf8');
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}
