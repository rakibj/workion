import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtType } from '../dto/jwt-payload';

function buildService(overrides: Record<string, any> = {}) {
  const deps = {
    signupService: {},
    tokenService: {
      verifyJwt: jest.fn(),
    },
    sessionService: {
      createSessionAndToken: jest.fn().mockResolvedValue('access-token'),
    },
    userSessionRepo: {},
    userRepo: {
      findById: jest.fn(),
    },
    userTokenRepo: {},
    mailService: {},
    domainService: {},
    environmentService: {},
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

describe('AuthService.exchangeToken (specs/MULTI_TENANCY_SPEC.md Slice 2)', () => {
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
