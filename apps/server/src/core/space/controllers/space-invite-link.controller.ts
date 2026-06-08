import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SpaceInviteLinkService } from '../services/space-invite-link.service';
import {
  CreateSpaceInviteLinkDto,
  DeleteSpaceInviteLinkDto,
  GetSpaceInviteLinksDto,
} from '../dto/space-invite-link.dto';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';

@UseGuards(JwtAuthGuard)
@Controller('spaces/invite-links')
export class SpaceInviteLinkController {
  constructor(
    private readonly spaceInviteLinkService: SpaceInviteLinkService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async createLink(
    @Body() dto: CreateSpaceInviteLinkDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Member)) {
      throw new ForbiddenException('You do not have permission to manage invite links');
    }
    return this.spaceInviteLinkService.createLink(dto, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  async listLinks(
    @Body() dto: GetSpaceInviteLinksDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Member)) {
      throw new ForbiddenException('You do not have permission to view invite links');
    }
    return this.spaceInviteLinkService.listLinks(dto.spaceId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteLink(
    @Body() dto: DeleteSpaceInviteLinkDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Member)) {
      throw new ForbiddenException('You do not have permission to delete invite links');
    }
    await this.spaceInviteLinkService.deleteLink(dto.linkId, dto.spaceId, workspace.id);
  }
}
