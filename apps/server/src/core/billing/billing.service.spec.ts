import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkionPlan } from '../../common/entitlement/entitlement';

describe('BillingService', () => {
  const environmentService = {
    getLemonSqueezyApiKey: jest.fn(() => 'api-key'),
    getLemonSqueezyStoreId: jest.fn(() => 'store-id'),
    getLemonSqueezyWebhookSecret: jest.fn(() => 'webhook-secret'),
    getLemonSqueezyVariantIds: jest.fn(() => ({
      tenant_basic: { monthly: 'basic-monthly', yearly: undefined },
      tenant_pro: { monthly: 'pro-monthly', yearly: undefined },
    })),
    getAppUrl: jest.fn(() => 'https://workionlive.example'),
  };

  const db = { transaction: jest.fn() };
  let service: BillingService;

  beforeEach(() => {
    jest.resetAllMocks();
    Object.assign(environmentService, {
      getLemonSqueezyApiKey: jest.fn(() => 'api-key'),
      getLemonSqueezyStoreId: jest.fn(() => 'store-id'),
      getLemonSqueezyWebhookSecret: jest.fn(() => 'webhook-secret'),
      getLemonSqueezyVariantIds: jest.fn(() => ({
        tenant_basic: { monthly: 'basic-monthly', yearly: undefined },
        tenant_pro: { monthly: 'pro-monthly', yearly: undefined },
      })),
      getAppUrl: jest.fn(() => 'https://workionlive.example'),
    });
    service = new BillingService(db as any, environmentService as unknown as EnvironmentService);
  });

  it('rejects a checkout variant that is not configured', async () => {
    await expect(
      service.createCheckout({ id: 'workspace-id' } as any, { email: 'owner@example.com' } as any, 'unknown'),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates checkout with the authenticated workspace as Lemon custom data', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { attributes: { url: 'https://checkout.example' } } }),
    } as any);

    await expect(
      service.createCheckout({ id: 'workspace-id' } as any, { email: 'owner@example.com' } as any, 'basic-monthly'),
    ).resolves.toEqual({ url: 'https://checkout.example' });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string).data.attributes.checkout_data).toEqual({
      email: 'owner@example.com',
      custom: { workspace_id: 'workspace-id', plan: WorkionPlan.TENANT_BASIC },
    });
  });

  it('rejects unsigned webhooks before any database access', async () => {
    await expect(service.handleWebhook(Buffer.from('{}'), 'invalid')).rejects.toThrow(UnauthorizedException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('uses a valid signature and applies an expired subscription as the restrictive plan', async () => {
    const rawBody = Buffer.from(JSON.stringify({
      meta: { event_name: 'subscription_expired', custom_data: { workspace_id: 'workspace-id' } },
      data: {
        id: 'subscription-id',
        attributes: {
          variant_id: 'pro-monthly', customer_id: 7, product_id: 8,
          status: 'expired', created_at: '2026-08-23T00:00:00.000Z',
          urls: {},
        },
      },
    }));
    const signature = require('node:crypto').createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');
    const setWorkspace = jest.fn(() => ({ where: () => ({ execute: jest.fn().mockResolvedValue(undefined) }) }));
    const trx = {
      selectFrom: jest.fn(() => ({ select: () => ({ where: () => ({ executeTakeFirst: jest.fn().mockResolvedValue(undefined) }) }) })),
      insertInto: jest.fn(() => ({ values: () => ({ execute: jest.fn().mockResolvedValue(undefined) }) })),
      updateTable: jest.fn(() => ({ set: setWorkspace })),
    };
    db.transaction.mockReturnValue({ execute: (callback: any) => callback(trx) });

    await service.handleWebhook(rawBody, signature);

    expect(trx.updateTable).toHaveBeenCalledWith('workspaces');
    expect(setWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      plan: WorkionPlan.TENANT_BASIC,
      status: 'expired',
    }));
  });
});
