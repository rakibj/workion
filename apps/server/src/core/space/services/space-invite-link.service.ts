import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SpaceInviteLinkRepo } from '@docmost/db/repos/space/space-invite-link.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { CreateSpaceInviteLinkDto } from '../dto/space-invite-link.dto';
import { SpaceInviteLink } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { randomBytes } from 'crypto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

@Injectable()
export class SpaceInviteLinkService {
  constructor(
    private spaceInviteLinkRepo: SpaceInviteLinkRepo,
    private spaceRepo: SpaceRepo,
    private spaceMemberRepo: SpaceMemberRepo,
    private environmentService: EnvironmentService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async createLink(
    dto: CreateSpaceInviteLinkDto,
    createdBy: string,
    workspaceId: string,
  ): Promise<SpaceInviteLink & { inviteUrl: string }> {
    const space = await this.spaceRepo.findById(dto.spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const token = randomBytes(32).toString('hex');

    const link = await this.spaceInviteLinkRepo.insert({
      spaceId: dto.spaceId,
      workspaceId,
      createdBy,
      token,
      spaceRole: dto.spaceRole,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      maxUses: dto.maxUses ?? null,
    });

    return { ...link, inviteUrl: this.buildInviteUrl(token) };
  }

  async listLinks(
    spaceId: string,
    workspaceId: string,
  ): Promise<Array<SpaceInviteLink & { inviteUrl: string }>> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const links = await this.spaceInviteLinkRepo.findBySpaceId(spaceId, workspaceId);
    return links.map((l) => ({ ...l, inviteUrl: this.buildInviteUrl(l.token) }));
  }

  async deleteLink(
    linkId: string,
    spaceId: string,
    workspaceId: string,
  ): Promise<void> {
    const link = await this.spaceInviteLinkRepo.findById(linkId, workspaceId);
    if (!link || link.spaceId !== spaceId) {
      throw new NotFoundException('Invite link not found');
    }
    await this.spaceInviteLinkRepo.deleteById(linkId, workspaceId);
  }

  async getPublicLinkInfo(token: string) {
    const link = await this.spaceInviteLinkRepo.findByToken(token);
    if (!link) {
      throw new NotFoundException('Invite link not found');
    }

    const isExpired = link.expiresAt ? new Date() > new Date(link.expiresAt) : false;
    const isMaxedOut = link.maxUses !== null && link.useCount >= link.maxUses;

    return {
      token: link.token,
      spaceName: (link as any).spaceName,
      spaceDescription: (link as any).spaceDescription,
      workspaceName: (link as any).workspaceName,
      spaceRole: link.spaceRole,
      expiresAt: link.expiresAt,
      isExpired,
      isDisabled: link.disabled || isMaxedOut,
    };
  }

  async validateToken(token: string) {
    const link = await this.spaceInviteLinkRepo.findByToken(token);
    if (!link) {
      throw new NotFoundException('Invite link not found');
    }
    if (link.disabled) {
      throw new GoneException('This invite link has been disabled');
    }
    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      throw new GoneException('This invite link has expired');
    }
    if (link.maxUses !== null && link.useCount >= link.maxUses) {
      throw new GoneException('This invite link has reached its maximum uses');
    }
    return link;
  }

  async checkAlreadyMember(userId: string, spaceId: string): Promise<void> {
    const existing = await this.spaceMemberRepo.getSpaceMemberByTypeId(spaceId, { userId });
    if (existing) {
      throw new ConflictException('You are already a member of this space');
    }
  }

  async incrementUseCount(linkId: string, trx?: any): Promise<void> {
    await this.spaceInviteLinkRepo.incrementUseCount(linkId, trx);
  }

  buildInviteUrl(token: string): string {
    const appUrl = this.environmentService.getAppUrl();
    return `${appUrl}/invite/${token}`;
  }
}
