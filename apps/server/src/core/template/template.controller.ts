import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TemplateService } from './template.service';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import {
  CreateTemplateDto,
  DeleteTemplateDto,
  TemplateInfoDto,
  TemplateListDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly templateRepo: TemplateRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async listTemplates(
    @Body() dto: TemplateListDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.listTemplates(user.id, workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getTemplate(
    @Body() dto: TemplateInfoDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateService.getTemplate(dto.templateId, workspace.id, true);
    if (template.spaceId) {
      await this.assertCanRead(user, template.spaceId);
    }
    return template;
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.spaceId) {
      await this.assertCanWrite(user, dto.spaceId);
    }
    return this.templateService.createTemplate(user.id, workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateTemplate(
    @Body() dto: UpdateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateRepo.findById(dto.templateId, workspace.id);
    if (!template) throw new NotFoundException('Template not found');
    await this.assertCanModify(user, template.spaceId, template.creatorId);
    return this.templateService.updateTemplate(dto.templateId, workspace.id, user.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteTemplate(
    @Body() dto: DeleteTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateRepo.findById(dto.templateId, workspace.id);
    if (!template) throw new NotFoundException('Template not found');
    await this.assertCanModify(user, template.spaceId, template.creatorId);
    await this.templateService.deleteTemplate(dto.templateId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('use')
  async useTemplate(
    @Body() dto: UseTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWrite(user, dto.spaceId);
    return this.templateService.useTemplate(user.id, workspace.id, dto);
  }

  private async assertCanRead(user: User, spaceId: string): Promise<void> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async assertCanWrite(user: User, spaceId: string): Promise<void> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async assertCanModify(
    user: User,
    spaceId: string | null,
    creatorId: string | null,
  ): Promise<void> {
    if (user.id === creatorId) return;
    if (spaceId) {
      await this.assertCanWrite(user, spaceId);
      return;
    }
    throw new ForbiddenException();
  }
}
