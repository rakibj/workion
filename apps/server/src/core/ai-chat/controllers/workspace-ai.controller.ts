import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../casl/interfaces/workspace-ability.type';
import { AiKeyService } from '../services/ai-key.service';
import { SaveAiKeyDto } from '../dto/save-ai-key.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspace/ai')
export class WorkspaceAiController {
  constructor(
    private readonly aiKeyService: AiKeyService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('key')
  async saveKey(
    @Body() dto: SaveAiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<void> {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    await this.aiKeyService.saveKey(workspace.id, dto.apiKey, dto.model);
  }

  @HttpCode(HttpStatus.OK)
  @Delete('key')
  async removeKey(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<void> {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    await this.aiKeyService.removeKey(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Get('key/status')
  async getKeyStatus(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ configured: boolean; model: string }> {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    return this.aiKeyService.getKeyStatus(workspace.id);
  }
}
