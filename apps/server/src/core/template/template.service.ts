import { Injectable, NotFoundException } from '@nestjs/common';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { Template } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PageService } from '../page/services/page.service';
import {
  CreateTemplateDto,
  DeleteTemplateDto,
  TemplateInfoDto,
  TemplateListDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';

@Injectable()
export class TemplateService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageService: PageService,
  ) {}

  async listTemplates(userId: string, workspaceId: string, dto: TemplateListDto) {
    const accessibleSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(userId);
    const pagination = new PaginationOptions();
    if (dto.limit) pagination.limit = dto.limit;
    if (dto.cursor) pagination.cursor = dto.cursor;
    if (dto.query) pagination.query = dto.query;
    return this.templateRepo.findTemplates(workspaceId, accessibleSpaceIds, pagination, {
      spaceId: dto.spaceId,
    });
  }

  async getTemplate(
    templateId: string,
    workspaceId: string,
    includeContent = false,
  ): Promise<Template> {
    const template = await this.templateRepo.findById(templateId, workspaceId, {
      includeContent,
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async createTemplate(
    userId: string,
    workspaceId: string,
    dto: CreateTemplateDto,
  ): Promise<Template> {
    const { id } = await this.templateRepo.insertTemplate({
      title: dto.title,
      description: dto.description,
      content: dto.content as any,
      icon: dto.icon,
      spaceId: dto.spaceId ?? null,
      workspaceId,
      creatorId: userId,
      lastUpdatedById: userId,
    });
    return this.templateRepo.findById(id, workspaceId, { includeContent: true });
  }

  async updateTemplate(
    templateId: string,
    workspaceId: string,
    userId: string,
    dto: UpdateTemplateDto,
  ): Promise<Template> {
    await this.templateRepo.updateTemplate(
      {
        title: dto.title,
        description: dto.description,
        content: dto.content as any,
        icon: dto.icon,
        lastUpdatedById: userId,
      },
      templateId,
      workspaceId,
    );
    return this.templateRepo.findById(templateId, workspaceId, { includeContent: true });
  }

  async deleteTemplate(templateId: string, workspaceId: string): Promise<void> {
    await this.templateRepo.deleteTemplate(templateId, workspaceId);
  }

  async useTemplate(userId: string, workspaceId: string, dto: UseTemplateDto) {
    const template = await this.templateRepo.findById(dto.templateId, workspaceId, {
      includeContent: true,
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return this.pageService.create(userId, workspaceId, {
      title: template.title ?? '',
      icon: template.icon ?? undefined,
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      content: template.content as any,
      format: 'json',
    });
  }
}
