import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtType } from '../dto/jwt-payload';
import { hashPassword } from '../../../common/helpers';

function buildService(overrides: Record<string, any> = {}) {
  const deps = {
    signupService: {},
    tokenService: {
      verifyJwt: jest.fn(),
      generateExchangeToken: jest.fn(),
    },
    sessionService: {
      createSessionAndToken: jest.fn().mockResolvedValue('access-token'),
    },
    userSessionRepo: {},
    userRepo: {
      findById: jest.fn(),
      findCloudUsersByEmail: jest.fn(),
      updateLastLogin: jest.fn(),
    },
    userTokenRepo: {},
    mailService: {},
    domainService: {},
    environmentService: {
      getAppSecret: jest.fn().mockReturnValue('test-secret'),
    },
    db: {},
    auditService: { log: jest.fn(), setActorId: jest.fn() },
    ...overrides,
  };

  const service = new (AuthService as any)(
    deps.signupService,
    deps.tokenService,
    deps.sessionService,
    deps.userSessionRepo,
    deps.userRepo,
    deps.userTokenRepo,
    deps.mailService,
    deps.domainService,
    deps.environmentService,
    deps.db,
    deps.auditService,
  ) as AuthService;

  return { service, deps };
}

describe('AuthService.cloudLogin', () => {
  it('returns a tenant-scoped exchange token for valid cloud credentials', async () => {
    const { service, deps } = buildService();
    const password = await hashPassword('password123');
    deps.userRepo.findCloudUsersByEmail.mockResolvedValue([
      {
        id: 'user-1',
        workspaceId: 'ws-1',
        email: 'jane@acme.com',
        password,
        hostname: 'acme',
        enforceSso: false,
        emailVerifiedAt: new Date(),
      },
    ]);
    deps.tokenService.generateExchangeToken.mockResolvedValue('exchange-token');

    await expect(
      service.cloudLogin({ email: 'jane@acme.com', password: 'password123' }),
    ).resolves.toEqual({ hostname: 'acme', exchangeToken: 'exchange-token' });
    expect(deps.userRepo.updateLastLogin).toHaveBeenCalledWith('user-1', 'ws-1');
  });

  it('does not disclose a workspace when no candidate password matches', async () => {
    const { service, deps } = buildService();
    deps.userRepo.findCloudUsersByEmail.mockResolvedValue([]);

    await expect(
      service.cloudLogin({ email: 'missing@acme.com', password: 'password123' }),
    ).rejects.toThrow('Email or password does not match');
  });
});

describe('AuthService.exchangeToken (docs/specs/done/MULTI_TENANCY_SPEC.md Slice 2)', () => {
  it('sets up a session for a valid, matching-workspace token', async () => {
    const { service, deps } = buildService();

    deps.tokenService.verifyJwt.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      type: JwtType.EXCHANGE,
    });
    deps.userRepo.findById.mockResolvedValue({ id: 'user-1', workspaceId: 'ws-1' });

    const authToken = await service.exchangeToken('jwt-token', 'ws-1');

    expect(authToken).toBe('access-token');
    expect(deps.tokenService.verifyJwt).toHaveBeenCalledWith(
      'jwt-token',
      JwtType.EXCHANGE,
    );
    expect(deps.sessionService.createSessionAndToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
    );
  });

  it('fails closed on an expired/invalid JWT instead of logging in', async () => {
    const { service, deps } = buildService();

    deps.tokenService.verifyJwt.mockRejectedValue(new Error('jwt expired'));

    await expect(service.exchangeToken('bad-token', 'ws-1')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(deps.sessionService.createSessionAndToken).not.toHaveBeenCalled();
  });

  it('fails closed when the token was minted for a different workspace', async () => {
    const { service, deps } = buildService();

    deps.tokenService.verifyJwt.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-OTHER',
      type: JwtType.EXCHANGE,
    });

    await expect(service.exchangeToken('jwt-token', 'ws-1')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(deps.sessionService.createSessionAndToken).not.toHaveBeenCalled();
  });

  it('fails closed when the token user no longer exists', async () => {
    const { service, deps } = buildService();

    deps.tokenService.verifyJwt.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      type: JwtType.EXCHANGE,
    });
    deps.userRepo.findById.mockResolvedValue(undefined);

    await expect(service.exchangeToken('jwt-token', 'ws-1')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
