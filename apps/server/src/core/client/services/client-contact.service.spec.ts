import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClientContactRepo } from '@docmost/db/repos/client/client-contact.repo';
import { ClientRepo } from '@docmost/db/repos/client/client.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import { ClientContactService } from './client-contact.service';

describe('ClientContactService', () => {
  const user = { id: 'user-1' } as any;
  const workspaceId = 'workspace-1';
  const clientId = 'client-1';
  let service: ClientContactService;
  let clientRepo: jest.Mocked<Partial<ClientRepo>>;
  let contactRepo: jest.Mocked<Partial<ClientContactRepo>>;
  let userRepo: jest.Mocked<Partial<UserRepo>>;
  let spaceMemberRepo: jest.Mocked<Partial<SpaceMemberRepo>>;
  let abilityFactory: jest.Mocked<Partial<SpaceAbilityFactory>>;

  beforeEach(async () => {
    clientRepo = {
      findById: jest.fn().mockResolvedValue({ id: clientId }),
      getLinkedSpaces: jest.fn().mockResolvedValue([{ id: 'space-1' }]),
      isSpaceLinked: jest.fn(),
    };
    contactRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByEmail: jest.fn(),
      update: jest.fn(),
      createGuestInvite: jest.fn(),
    };
    userRepo = { findById: jest.fn() };
    spaceMemberRepo = { getSpaceMemberByTypeId: jest.fn() };
    abilityFactory = { createForUser: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ClientContactService,
        { provide: ClientRepo, useValue: clientRepo },
        { provide: ClientContactRepo, useValue: contactRepo },
        { provide: UserRepo, useValue: userRepo },
        { provide: SpaceMemberRepo, useValue: spaceMemberRepo },
        { provide: SpaceAbilityFactory, useValue: abilityFactory },
      ],
    }).compile();
    service = module.get(ClientContactService);
  });

  it('creates a manual contact for a space writer', async () => {
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });
    (contactRepo.create as jest.Mock).mockResolvedValue({ id: 'contact-1' });

    await expect(
      service.create(user, workspaceId, clientId, {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }),
    ).resolves.toEqual({ id: 'contact-1' });
    expect(contactRepo.create).toHaveBeenCalledWith({
      clientId,
      workspaceId,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      source: 'manual',
      createdById: user.id,
    });
  });

  it('rejects a reader from creating a contact', async () => {
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(false),
    });
    await expect(
      service.create(user, workspaceId, clientId, {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks guest identity edits but allows agency annotations', async () => {
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });
    (contactRepo.findById as jest.Mock).mockResolvedValue({
      id: 'contact-1',
      source: 'guest_invite',
    });

    await expect(
      service.update(user, workspaceId, clientId, 'contact-1', {
        name: 'Changed',
      }),
    ).rejects.toThrow(BadRequestException);

    (contactRepo.update as jest.Mock).mockResolvedValue({ id: 'contact-1' });
    await expect(
      service.update(user, workspaceId, clientId, 'contact-1', {
        title: 'Marketing Director',
        isPrimary: true,
      }),
    ).resolves.toEqual({ id: 'contact-1' });
  });

  it('keeps adding an already-associated space member idempotent', async () => {
    const member = {
      id: 'member-1',
      name: 'Ada Lovelace',
      email: 'ada@new-example.com',
    } as any;
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });
    (clientRepo.isSpaceLinked as jest.Mock).mockResolvedValue(true);
    (spaceMemberRepo.getSpaceMemberByTypeId as jest.Mock).mockResolvedValue({
      id: 'space-member-1',
    });
    (userRepo.findById as jest.Mock).mockResolvedValue(member);
    (contactRepo.findByUserId as jest.Mock).mockResolvedValue({
      id: 'contact-1',
      userId: member.id,
      email: 'ada@old-example.com',
    });

    await expect(
      service.addExistingSpaceMember(
        user,
        workspaceId,
        clientId,
        'space-1',
        member.id,
      ),
    ).resolves.toBeUndefined();

    expect(contactRepo.findByUserId).toHaveBeenCalledWith(
      clientId,
      workspaceId,
      member.id,
      undefined,
    );
    expect(contactRepo.createGuestInvite).not.toHaveBeenCalled();
    expect(contactRepo.update).not.toHaveBeenCalled();
  });

  it('associates an existing space member with the linked client', async () => {
    const member = {
      id: 'member-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    } as any;
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });
    (clientRepo.isSpaceLinked as jest.Mock).mockResolvedValue(true);
    (spaceMemberRepo.getSpaceMemberByTypeId as jest.Mock).mockResolvedValue({
      id: 'space-member-1',
    });
    (userRepo.findById as jest.Mock).mockResolvedValue(member);
    (contactRepo.findByUserId as jest.Mock).mockResolvedValue(undefined);
    (contactRepo.findByEmail as jest.Mock).mockResolvedValue(undefined);

    await service.addExistingSpaceMember(
      user,
      workspaceId,
      clientId,
      'space-1',
      member.id,
    );

    expect(contactRepo.createGuestInvite).toHaveBeenCalledWith(
      {
        workspaceId,
        clientId,
        userId: member.id,
        name: member.name,
        email: member.email,
        source: 'guest_invite',
      },
      undefined,
    );
  });
});
