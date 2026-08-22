import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientRepo } from '@docmost/db/repos/client/client.repo';
import {
  ProjectFilters,
  ProjectRepo,
} from '@docmost/db/repos/project/project.repo';
import { Project, User } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';
import { ProjectStatus } from '../dto/project-status';

export type CreateProjectInput = {
  clientId: string;
  spaceId: string;
  name: string;
  description?: string;
  dueDate?: string;
};

export type UpdateProjectInput = {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  dueDate?: string;
};

@Injectable()
export class ProjectService {
  constructor(
    private readonly clientRepo: ClientRepo,
    private readonly projectRepo: ProjectRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async create(
    user: User,
    workspaceId: string,
    input: CreateProjectInput,
  ): Promise<Project> {
    await this.findVisibleClient(user, workspaceId, input.clientId);
    const isLinked = await this.clientRepo.isSpaceLinked(
      input.clientId,
      input.spaceId,
    );
    if (!isLinked)
      throw new NotFoundException('Space is not linked to this client');
    await this.assertCanManageSpace(user, input.spaceId);

    return this.projectRepo.create({
      workspaceId,
      clientId: input.clientId,
      spaceId: input.spaceId,
      name: input.name,
      description: input.description,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      createdById: user.id,
    });
  }

  async list(
    user: User,
    workspaceId: string,
    filters: ProjectFilters = {},
  ): Promise<Project[]> {
    const visibleClients = await this.clientRepo.findVisibleToUser(
      user.id,
      workspaceId,
    );
    const visibleClientIds = new Set(visibleClients.map((client) => client.id));
    if (filters.clientId && !visibleClientIds.has(filters.clientId)) return [];

    const projects = await this.projectRepo.list(workspaceId, filters);
    return projects.filter((project) => visibleClientIds.has(project.clientId));
  }

  async get(
    user: User,
    workspaceId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await this.findProject(workspaceId, projectId);
    await this.findVisibleClient(user, workspaceId, project.clientId);
    return project;
  }

  async update(
    user: User,
    workspaceId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const project = await this.get(user, workspaceId, projectId);
    await this.assertCanManageSpace(user, project.spaceId);
    const updated = await this.projectRepo.update(project.id, workspaceId, {
      ...input,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    });
    if (!updated) throw new NotFoundException('Project not found');
    return updated;
  }

  async archive(
    user: User,
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const project = await this.get(user, workspaceId, projectId);
    await this.assertCanManageSpace(user, project.spaceId);
    const archived = await this.projectRepo.archive(project.id, workspaceId);
    if (!archived) throw new NotFoundException('Project not found');
  }

  private async findProject(
    workspaceId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await this.projectRepo.findById(projectId, workspaceId);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async findVisibleClient(
    user: User,
    workspaceId: string,
    clientId: string,
  ) {
    const clients = await this.clientRepo.findVisibleToUser(
      user.id,
      workspaceId,
    );
    const client = clients.find((item) => item.id === clientId);
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  private async assertCanManageSpace(
    user: User,
    spaceId: string,
  ): Promise<void> {
    try {
      const ability = await this.spaceAbility.createForUser(user, spaceId);
      if (ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) return;
    } catch {
      // Membership failures are intentionally presented as a permission denial.
    }
    throw new ForbiddenException();
  }
}
