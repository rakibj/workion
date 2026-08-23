import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { ClientRepo } from '@docmost/db/repos/client/client.repo';
import { ClientContactRepo } from '@docmost/db/repos/client/client-contact.repo';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import { ClientService } from './client.service';

describe('ClientService', () => {
  let service: ClientService;
  let clientRepo: jest.Mocked<Partial<ClientRepo>>;
  let abilityFactory: jest.Mocked<Partial<SpaceAbilityFactory>>;

  const user = { id: 'user-1' } as any;
  const workspaceId = 'workspace-1';
  const spaceId = 'space-1';

  beforeEach(async () => {
    clientRepo = {
      create: jest.fn(),
      linkSpace: jest.fn(),
      findVisibleToUser: jest.fn(),
      getLinkedSpaces: jest.fn(),
      findBySpaceId: jest.fn(),
    };
    abilityFactory = { createForUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: ClientRepo, useValue: clientRepo },
        { provide: ClientContactRepo, useValue: { findByClientId: jest.fn() } },
        { provide: SpaceAbilityFactory, useValue: abilityFactory },
        {
          provide: KYSELY_MODULE_CONNECTION_TOKEN(undefined),
          useValue: {
            transaction: () => ({ execute: (callback) => callback({}) }),
          },
        },
      ],
    }).compile();

    service = module.get(ClientService);
  });

  it('creates and links a client when the requester can manage the first space', async () => {
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });
    (clientRepo.create as jest.Mock).mockResolvedValue({ id: 'client-1' });

    await expect(
      service.create(user, workspaceId, { name: 'Acme', spaceId }),
    ).resolves.toEqual({ id: 'client-1' });

    expect(clientRepo.create).toHaveBeenCalledWith(
      { name: 'Acme', workspaceId, createdById: user.id },
      {},
    );
    expect(clientRepo.linkSpace).toHaveBeenCalledWith(
      { clientId: 'client-1', spaceId },
      {},
    );
  });

  it('rejects creating a client when the requester is only a reader of the first space', async () => {
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(false),
    });

    await expect(
      service.create(user, workspaceId, { name: 'Acme', spaceId }),
    ).rejects.toThrow(ForbiddenException);
    expect(clientRepo.create).not.toHaveBeenCalled();
  });

  it('rejects linking a space the requester cannot manage', async () => {
    (clientRepo.findVisibleToUser as jest.Mock).mockResolvedValue([
      { id: 'client-1' },
    ]);
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(false),
    });

    await expect(
      service.linkSpace(user, workspaceId, 'client-1', spaceId),
    ).rejects.toThrow(ForbiddenException);
    expect(clientRepo.linkSpace).not.toHaveBeenCalled();
  });

  it('lists visible clients with only their readable linked spaces', async () => {
    const visibleClients = [{ id: 'client-1', name: 'Acme' }];
    (clientRepo.findVisibleToUser as jest.Mock).mockResolvedValue(
      visibleClients,
    );
    (clientRepo.getLinkedSpaces as jest.Mock).mockResolvedValue([
      { id: spaceId, name: 'Website' },
    ]);
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });

    await expect(service.list(user, workspaceId)).resolves.toEqual(
      [{ ...visibleClients[0], spaces: [{ id: spaceId, name: 'Website' }] }],
    );
  });

  it('does not expose linked spaces the requester cannot read', async () => {
    (clientRepo.findVisibleToUser as jest.Mock).mockResolvedValue([
      { id: 'client-1', name: 'Acme' },
    ]);
    (clientRepo.getLinkedSpaces as jest.Mock).mockResolvedValue([
      { id: 'private-space', name: 'Private' },
    ]);
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(false),
    });

    await expect(service.list(user, workspaceId)).resolves.toEqual([
      { id: 'client-1', name: 'Acme', spaces: [] },
    ]);
  });

  it('returns the client linked to a space for a member who can read it', async () => {
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });
    (clientRepo.findBySpaceId as jest.Mock).mockResolvedValue({
      id: 'client-1',
    });

    await expect(
      service.getBySpace(user, workspaceId, spaceId),
    ).resolves.toEqual({ id: 'client-1' });
  });

  it('returns null when the space has no linked client', async () => {
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });
    (clientRepo.findBySpaceId as jest.Mock).mockResolvedValue(undefined);

    await expect(
      service.getBySpace(user, workspaceId, spaceId),
    ).resolves.toBeNull();
  });

  it('rejects reading a client-by-space lookup for a non-member of the space', async () => {
    (abilityFactory.createForUser as jest.Mock).mockRejectedValue(
      new Error('not a member'),
    );

    await expect(
      service.getBySpace(user, workspaceId, spaceId),
    ).rejects.toThrow(ForbiddenException);
    expect(clientRepo.findBySpaceId).not.toHaveBeenCalled();
  });
});
