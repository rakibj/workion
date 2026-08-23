import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ClientRepo } from '@docmost/db/repos/client/client.repo';
import { ClientContactRepo } from '@docmost/db/repos/client/client-contact.repo';
import { Client, User } from '@docmost/db/types/entity.types';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';

export type CreateClientInput = {
  name: string;
  spaceId: string;
};

export type UpdateClientInput = {
  name?: string;
  status?: string;
};

@Injectable()
export class ClientService {
  constructor(
    private readonly clientRepo: ClientRepo,
    private readonly clientContactRepo: ClientContactRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async create(
    user: User,
    workspaceId: string,
    input: CreateClientInput,
  ): Promise<Client> {
    await this.assertCanManageSpace(user, input.spaceId);

    return executeTx(this.db, async (trx) => {
      const client = await this.clientRepo.create(
        { name: input.name, workspaceId, createdById: user.id },
        trx,
      );
      await this.clientRepo.linkSpace(
        { clientId: client.id, spaceId: input.spaceId },
        trx,
      );
      return client;
    });
  }

  async list(user: User, workspaceId: string): Promise<Client[]> {
    return this.clientRepo.findVisibleToUser(user.id, workspaceId);
  }

  async getBySpace(
    user: User,
    workspaceId: string,
    spaceId: string,
  ): Promise<Client | null> {
    let canRead = false;
    try {
      const ability = await this.spaceAbility.createForUser(user, spaceId);
      canRead = ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page);
    } catch {
      // Membership failures are intentionally presented as a permission denial.
    }
    if (!canRead) throw new ForbiddenException();

    const client = await this.clientRepo.findBySpaceId(spaceId, workspaceId);
    return client ?? null;
  }

  async get(user: User, workspaceId: string, clientId: string) {
    const client = await this.findVisibleClient(user, workspaceId, clientId);
    const [spaces, contacts] = await Promise.all([
      this.clientRepo.getLinkedSpaces(client.id),
      this.clientContactRepo.findByClientId(client.id, workspaceId),
    ]);
    return {
      client: { ...client, contactCount: contacts.length },
      spaces,
      contacts,
      canManage: await this.canManageClient(user, client.id),
    };
  }

  async update(
    user: User,
    workspaceId: string,
    clientId: string,
    input: UpdateClientInput,
  ): Promise<Client> {
    const client = await this.findVisibleClient(user, workspaceId, clientId);
    await this.assertCanManageClient(user, client.id);
    const updated = await this.clientRepo.update(client.id, workspaceId, input);
    if (!updated) throw new NotFoundException('Client not found');
    return updated;
  }

  async archive(
    user: User,
    workspaceId: string,
    clientId: string,
  ): Promise<void> {
    const client = await this.findVisibleClient(user, workspaceId, clientId);
    await this.assertCanManageClient(user, client.id);
    const archived = await this.clientRepo.archive(client.id, workspaceId);
    if (!archived) throw new NotFoundException('Client not found');
  }

  async linkSpace(
    user: User,
    workspaceId: string,
    clientId: string,
    spaceId: string,
  ): Promise<void> {
    await this.findVisibleClient(user, workspaceId, clientId);
    await this.assertCanManageSpace(user, spaceId);
    await this.clientRepo.linkSpace({ clientId, spaceId });
  }

  async unlinkSpace(
    user: User,
    workspaceId: string,
    clientId: string,
    spaceId: string,
  ): Promise<void> {
    await this.findVisibleClient(user, workspaceId, clientId);
    await this.assertCanManageSpace(user, spaceId);
    await this.clientRepo.unlinkSpace(clientId, spaceId);
  }

  private async findVisibleClient(
    user: User,
    workspaceId: string,
    clientId: string,
  ): Promise<Client> {
    const clients = await this.clientRepo.findVisibleToUser(
      user.id,
      workspaceId,
    );
    const client = clients.find((item) => item.id === clientId);
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  private async assertCanManageClient(
    user: User,
    clientId: string,
  ): Promise<void> {
    if (!(await this.canManageClient(user, clientId)))
      throw new ForbiddenException();
  }

  private async canManageClient(
    user: User,
    clientId: string,
  ): Promise<boolean> {
    const spaces = await this.clientRepo.getLinkedSpaces(clientId);
    const checks = await Promise.all(
      spaces.map(async (space) => {
        try {
          const ability = await this.spaceAbility.createForUser(user, space.id);
          return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);
        } catch {
          return false;
        }
      }),
    );

    return checks.some(Boolean);
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
