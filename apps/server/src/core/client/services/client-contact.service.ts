import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientContactRepo } from '@docmost/db/repos/client/client-contact.repo';
import { ClientRepo } from '@docmost/db/repos/client/client.repo';
import {
  ClientContact,
  InsertableClientContact,
  User,
} from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';

export type CreateClientContactInput = {
  name: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
};

export type UpdateClientContactInput = Partial<
  Omit<CreateClientContactInput, 'phone' | 'title'> & {
    phone: string | null;
    title: string | null;
  }
>;

@Injectable()
export class ClientContactService {
  constructor(
    private readonly clientRepo: ClientRepo,
    private readonly clientContactRepo: ClientContactRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async list(user: User, workspaceId: string, clientId: string) {
    await this.assertCanViewClient(user, workspaceId, clientId);
    return this.clientContactRepo.findByClientId(clientId, workspaceId);
  }

  async create(
    user: User,
    workspaceId: string,
    clientId: string,
    input: CreateClientContactInput,
  ): Promise<ClientContact> {
    await this.assertCanManageClient(user, workspaceId, clientId);
    return this.clientContactRepo.create({
      ...input,
      workspaceId,
      clientId,
      source: 'manual',
      createdById: user.id,
    });
  }

  async update(
    user: User,
    workspaceId: string,
    clientId: string,
    contactId: string,
    input: UpdateClientContactInput,
  ): Promise<ClientContact> {
    await this.assertCanManageClient(user, workspaceId, clientId);
    const contact = await this.getContact(contactId, clientId, workspaceId);
    if (
      contact.source === 'guest_invite' &&
      (input.name !== undefined || input.email !== undefined)
    ) {
      throw new BadRequestException(
        'Portal user contact name and email cannot be changed',
      );
    }
    const updated = await this.clientContactRepo.update(
      contactId,
      clientId,
      workspaceId,
      input,
    );
    if (!updated) throw new NotFoundException('Client contact not found');
    return updated;
  }

  async archive(
    user: User,
    workspaceId: string,
    clientId: string,
    contactId: string,
  ): Promise<void> {
    await this.assertCanManageClient(user, workspaceId, clientId);
    await this.getContact(contactId, clientId, workspaceId);
    const archived = await this.clientContactRepo.archive(
      contactId,
      clientId,
      workspaceId,
    );
    if (!archived) throw new NotFoundException('Client contact not found');
  }

  async linkGuestToSpaceClients(
    user: Pick<User, 'id' | 'name' | 'email'>,
    workspaceId: string,
    spaceId: string,
    trx?: any,
  ): Promise<void> {
    const clients = await this.clientRepo.findClientsBySpaceId(
      spaceId,
      workspaceId,
      trx,
    );
    await Promise.all(
      clients.map((client) =>
        this.clientContactRepo.createGuestInvite(
          {
            workspaceId,
            clientId: client.id,
            userId: user.id,
            name: user.name,
            email: user.email,
            source: 'guest_invite',
          } as InsertableClientContact,
          trx,
        ),
      ),
    );
  }

  async upsertPortalUser(
    user: Pick<User, 'id' | 'name' | 'email'>,
    workspaceId: string,
    clientId: string,
    trx?: any,
  ): Promise<void> {
    const existing = await this.clientContactRepo.findByEmail(
      clientId,
      workspaceId,
      user.email,
      trx,
    );
    if (existing) {
      await this.clientContactRepo.update(
        existing.id,
        clientId,
        workspaceId,
        {
          userId: user.id,
          name: user.name,
          email: user.email,
          source: 'guest_invite',
        },
        trx,
      );
      return;
    }
    await this.clientContactRepo.createGuestInvite(
      {
        workspaceId,
        clientId,
        userId: user.id,
        name: user.name,
        email: user.email,
        source: 'guest_invite',
      },
      trx,
    );
  }

  private async getContact(
    contactId: string,
    clientId: string,
    workspaceId: string,
  ) {
    const contact = await this.clientContactRepo.findById(
      contactId,
      clientId,
      workspaceId,
    );
    if (!contact) throw new NotFoundException('Client contact not found');
    return contact;
  }

  private async assertCanViewClient(
    user: User,
    workspaceId: string,
    clientId: string,
  ) {
    const spaces = await this.getClientSpaces(workspaceId, clientId);
    const checks = await Promise.all(
      spaces.map(async (space) => {
        try {
          const ability = await this.spaceAbility.createForUser(user, space.id);
          return ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page);
        } catch {
          return false;
        }
      }),
    );
    if (!checks.some(Boolean)) throw new NotFoundException('Client not found');
  }

  private async assertCanManageClient(
    user: User,
    workspaceId: string,
    clientId: string,
  ) {
    const spaces = await this.getClientSpaces(workspaceId, clientId);
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
    if (!checks.some(Boolean)) throw new ForbiddenException();
  }

  private async getClientSpaces(workspaceId: string, clientId: string) {
    const client = await this.clientRepo.findById(clientId, workspaceId);
    if (!client) throw new NotFoundException('Client not found');
    return this.clientRepo.getLinkedSpaces(client.id);
  }
}
