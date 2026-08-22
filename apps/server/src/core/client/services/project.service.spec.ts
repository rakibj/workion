import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepo } from '@docmost/db/repos/client/client.repo';
import { ProjectRepo } from '@docmost/db/repos/project/project.repo';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import { ProjectService } from './project.service';

describe('ProjectService', () => {
  let service: ProjectService;
  let clientRepo: jest.Mocked<Partial<ClientRepo>>;
  let projectRepo: jest.Mocked<Partial<ProjectRepo>>;
  let abilityFactory: jest.Mocked<Partial<SpaceAbilityFactory>>;

  const user = { id: 'user-1' } as any;
  const workspaceId = 'workspace-1';
  const clientId = 'client-1';
  const spaceId = 'space-1';

  beforeEach(async () => {
    clientRepo = {
      findVisibleToUser: jest.fn().mockResolvedValue([{ id: clientId }]),
      isSpaceLinked: jest.fn().mockResolvedValue(true),
    };
    projectRepo = { create: jest.fn(), list: jest.fn(), findById: jest.fn() };
    abilityFactory = { createForUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: ClientRepo, useValue: clientRepo },
        { provide: ProjectRepo, useValue: projectRepo },
        { provide: SpaceAbilityFactory, useValue: abilityFactory },
      ],
    }).compile();
    service = module.get(ProjectService);
  });

  it('rejects project creation when the selected space is not linked to the client', async () => {
    (clientRepo.isSpaceLinked as jest.Mock).mockResolvedValue(false);

    await expect(
      service.create(user, workspaceId, { clientId, spaceId, name: 'Website' }),
    ).rejects.toThrow(NotFoundException);
    expect(projectRepo.create).not.toHaveBeenCalled();
  });

  it('creates a project when the requester can manage its linked space', async () => {
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
    });
    (projectRepo.create as jest.Mock).mockResolvedValue({ id: 'project-1' });

    await expect(
      service.create(user, workspaceId, { clientId, spaceId, name: 'Website' }),
    ).resolves.toEqual({ id: 'project-1' });
    expect(projectRepo.create).toHaveBeenCalledWith({
      clientId,
      spaceId,
      workspaceId,
      name: 'Website',
      createdById: user.id,
    });
  });

  it('filters projects by client, space, and status', async () => {
    const projects = [
      { id: 'project-1', clientId, spaceId, status: 'planning' },
    ];
    (projectRepo.list as jest.Mock).mockResolvedValue(projects);

    await expect(
      service.list(user, workspaceId, {
        clientId,
        spaceId,
        status: 'planning',
      }),
    ).resolves.toEqual(projects);
    expect(projectRepo.list).toHaveBeenCalledWith(workspaceId, {
      clientId,
      spaceId,
      status: 'planning',
    });
  });

  it('rejects updates by a requester who cannot manage the project space', async () => {
    (projectRepo.findById as jest.Mock).mockResolvedValue({
      id: 'project-1',
      clientId,
      spaceId,
    });
    (abilityFactory.createForUser as jest.Mock).mockResolvedValue({
      can: jest.fn().mockReturnValue(false),
    });

    await expect(
      service.update(user, workspaceId, 'project-1', { name: 'New name' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
