import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { UserRole } from '../../../common/helpers/types/permission';
import { UserTokenType } from '../../auth/auth.constants';
import { computeEmailSignature } from '../../auth/auth.util';
import { WorkionPlan } from '../../../common/entitlement/entitlement';

function createChainableTrx() {
  const chainable: any = {
    updateTable: jest.fn(() => chainable),
    deleteFrom: jest.fn(() => chainable),
    set: jest.fn(() => chainable),
    where: jest.fn(() => chainable),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  return chainable;
}

function buildService(overrides: Record<string, any> = {}) {
  const trx = createChainableTrx();
  const db: any = {
    transaction: jest.fn(() => ({
      execute: (cb: (trx: any) => Promise<any>) => cb(trx),
    })),
  };

  const deps = {
    workspaceRepo: {
      insertWorkspace: jest.fn(),
      updateWorkspace: jest.fn(),
      hostnameExists: jest.fn().mockResolvedValue(false),
    },
    spaceService: { create: jest.fn() },
    spaceMemberService: {
      addUserToSpace: jest.fn(),
      addGroupToSpace: jest.fn(),
    },
    groupRepo: { createDefaultGroup: jest.fn() },
    groupUserRepo: { insertGroupUser: jest.fn() },
    userRepo: {
      insertUser: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      updateUser: jest.fn(),
    },
    environmentService: {
      isCloud: jest.fn().mockReturnValue(true),
      getBillingTrialDays: jest.fn().mockReturnValue(14),
      getAppSecret: jest.fn().mockReturnValue('test-secret'),
      getSubdomainHost: jest.fn().mockReturnValue('workionlive.gameloops.io'),
    },
    domainService: { getUrl: jest.fn().mockReturnValue('https://acme.example.com') },
    licenseCheckService: {},
    shareRepo: {},
    watcherRepo: {},
    favoriteRepo: {},
    attachmentQueue: { add: jest.fn() },
    billingQueue: { add: jest.fn() },
    aiQueue: { add: jest.fn() },
    auditService: { log: jest.fn(), setActorId: jest.fn() },
    userSessionRepo: {},
    userTokenRepo: {
      findById: jest.fn(),
      insertUserToken: jest.fn(),
      deleteToken: jest.fn(),
    },
    mailService: { sendToQueue: jest.fn() },
    sessionService: { createSessionAndToken: jest.fn().mockResolvedValue('access-token') },
    ...overrides,
  };

  const service = new (WorkspaceService as any)(
    deps.workspaceRepo,
    deps.spaceService,
    deps.spaceMemberService,
    deps.groupRepo,
    deps.groupUserRepo,
    deps.userRepo,
    deps.environmentService,
    deps.domainService,
    deps.licenseCheckService,
    deps.shareRepo,
    deps.watcherRepo,
    deps.favoriteRepo,
    db,
    deps.attachmentQueue,
    deps.billingQueue,
    deps.aiQueue,
    deps.auditService,
    deps.userSessionRepo,
    deps.userTokenRepo,
    deps.mailService,
    deps.sessionService,
  ) as WorkspaceService;

  return { service, deps, trx, db };
}

describe('WorkspaceService.create — cloud plan default (Slice 3)', () => {
  it('assigns WorkionPlan.FREE, not the internal-only default, on a cloud workspace', async () => {
    const { service, deps } = buildService();

    deps.workspaceRepo.insertWorkspace.mockResolvedValue({
      id: 'ws-1',
      hostname: 'acme',
    });
    deps.groupRepo.createDefaultGroup.mockResolvedValue({ id: 'group-1' });
    deps.spaceService.create.mockResolvedValue({ id: 'space-1' });

    const user: any = { id: 'user-1', email: 'owner@acme.com' };
    await service.create(user, { name: 'Acme' } as any);

    expect(deps.workspaceRepo.insertWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ plan: WorkionPlan.FREE }),
      expect.anything(),
    );
  });
});

describe('WorkspaceService.createCloudWorkspace', () => {
  it('creates the workspace, sends a verification email, and always requires verification', async () => {
    const { service, deps } = buildService();

    const user: any = { id: 'user-1', name: 'Jane', email: 'jane@acme.com' };
    const workspace: any = { id: 'ws-1', hostname: 'acme' };

    deps.userRepo.insertUser.mockResolvedValue(user);
    jest.spyOn(service, 'create').mockResolvedValue(workspace);

    const result = await service.createCloudWorkspace({
      name: 'Jane',
      email: 'jane@acme.com',
      password: 'password123',
      workspaceName: 'Acme',
    } as any);

    expect(deps.userRepo.insertUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.OWNER, email: 'jane@acme.com' }),
      expect.anything(),
    );
    expect(deps.mailService.sendToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jane@acme.com' }),
    );
    expect(deps.userTokenRepo.insertUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'ws-1',
        type: UserTokenType.EMAIL_VERIFICATION,
      }),
      expect.anything(),
    );
    expect(result).toEqual({
      workspace,
      requiresEmailVerification: true,
      emailSignature: computeEmailSignature('jane@acme.com', 'ws-1', 'test-secret'),
    });
  });
});

describe('WorkspaceService.verifyEmail', () => {
  const workspace: any = { id: 'ws-1', hostname: 'acme' };

  it('marks the user verified and logs them in on a valid token', async () => {
    const { service, deps } = buildService();

    deps.userTokenRepo.findById.mockResolvedValue({
      token: 'tok-1',
      userId: 'user-1',
      type: UserTokenType.EMAIL_VERIFICATION,
      expiresAt: new Date(Date.now() + 60_000),
    });
    deps.userRepo.findById.mockResolvedValue({ id: 'user-1', email: 'jane@acme.com' });

    const authToken = await service.verifyEmail('tok-1', workspace);

    expect(authToken).toBe('access-token');
    expect(deps.userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      'user-1',
      'ws-1',
      expect.anything(),
    );
    expect(deps.userTokenRepo.deleteToken).toHaveBeenCalledWith('tok-1', expect.anything());
    expect(deps.sessionService.createSessionAndToken).toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service, deps } = buildService();

    deps.userTokenRepo.findById.mockResolvedValue({
      token: 'tok-1',
      userId: 'user-1',
      type: UserTokenType.EMAIL_VERIFICATION,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(service.verifyEmail('tok-1', workspace)).rejects.toThrow(
      BadRequestException,
    );
    expect(deps.sessionService.createSessionAndToken).not.toHaveBeenCalled();
  });

  it('rejects a token of the wrong type (e.g. a forgot-password token)', async () => {
    const { service, deps } = buildService();

    deps.userTokenRepo.findById.mockResolvedValue({
      token: 'tok-1',
      userId: 'user-1',
      type: 'forgot-password',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyEmail('tok-1', workspace)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException if the token user no longer exists', async () => {
    const { service, deps } = buildService();

    deps.userTokenRepo.findById.mockResolvedValue({
      token: 'tok-1',
      userId: 'user-1',
      type: UserTokenType.EMAIL_VERIFICATION,
      expiresAt: new Date(Date.now() + 60_000),
    });
    deps.userRepo.findById.mockResolvedValue(undefined);

    await expect(service.verifyEmail('tok-1', workspace)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('WorkspaceService.resendVerificationEmail', () => {
  const workspace: any = { id: 'ws-1', hostname: 'acme' };

  it('rejects a forged or mismatched signature', async () => {
    const { service, deps } = buildService();

    await expect(
      service.resendVerificationEmail('jane@acme.com', 'not-the-real-sig', workspace),
    ).rejects.toThrow(BadRequestException);
    expect(deps.userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('silently no-ops for an already-verified user instead of leaking state', async () => {
    const { service, deps } = buildService();
    const sig = computeEmailSignature('jane@acme.com', 'ws-1', 'test-secret');

    deps.userRepo.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'jane@acme.com',
      emailVerifiedAt: new Date(),
    });

    await service.resendVerificationEmail('jane@acme.com', sig, workspace);

    expect(deps.mailService.sendToQueue).not.toHaveBeenCalled();
  });

  it('resends the verification email for a valid signature and unverified user', async () => {
    const { service, deps } = buildService();
    const sig = computeEmailSignature('jane@acme.com', 'ws-1', 'test-secret');

    deps.userRepo.findByEmail.mockResolvedValue({
      id: 'user-1',
      name: 'Jane',
      email: 'jane@acme.com',
      emailVerifiedAt: null,
    });

    await service.resendVerificationEmail('jane@acme.com', sig, workspace);

    expect(deps.mailService.sendToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jane@acme.com' }),
    );
  });
});

describe('WorkspaceService.isDomainAllowed (Caddy on_demand_tls ask gate, Slice 4)', () => {
  it('allows the bare SUBDOMAIN_HOST apex', async () => {
    const { service } = buildService();
    await expect(
      service.isDomainAllowed('workionlive.gameloops.io'),
    ).resolves.toBe(true);
  });

  it('allows a subdomain matching a real workspace hostname', async () => {
    const { service, deps } = buildService();
    deps.workspaceRepo.hostnameExists.mockResolvedValue(true);

    await expect(
      service.isDomainAllowed('acme.workionlive.gameloops.io'),
    ).resolves.toBe(true);
    expect(deps.workspaceRepo.hostnameExists).toHaveBeenCalledWith('acme');
  });

  it('denies a subdomain with no matching workspace', async () => {
    const { service, deps } = buildService();
    deps.workspaceRepo.hostnameExists.mockResolvedValue(false);

    await expect(
      service.isDomainAllowed('nonexistent.workionlive.gameloops.io'),
    ).resolves.toBe(false);
  });

  it('denies an unrelated domain entirely (not a subdomain of SUBDOMAIN_HOST)', async () => {
    const { service, deps } = buildService();

    await expect(
      service.isDomainAllowed('evil.example.com'),
    ).resolves.toBe(false);
    expect(deps.workspaceRepo.hostnameExists).not.toHaveBeenCalled();
  });

  it('denies a bare-suffix domain with an empty hostname label', async () => {
    const { service } = buildService();
    await expect(
      service.isDomainAllowed('.workionlive.gameloops.io'),
    ).resolves.toBe(false);
  });
});
