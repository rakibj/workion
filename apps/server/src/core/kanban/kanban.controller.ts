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
import { KanbanService } from './kanban.service';
import { KanbanRepo } from '@docmost/db/repos/kanban/kanban.repo';
import {
  CardAssigneeDto,
  CreateCardDto,
  CreateColumnDto,
  DeleteCardDto,
  DeleteColumnDto,
  GetBoardDto,
  MoveCardDto,
  MoveColumnDto,
  UpdateCardDto,
  UpdateColumnDto,
} from './dto/kanban.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';

@UseGuards(JwtAuthGuard)
@Controller('kanban')
export class KanbanController {
  constructor(
    private readonly kanbanService: KanbanService,
    private readonly kanbanRepo: KanbanRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  // ─── Board ────────────────────────────────────────────────────────────────

  @HttpCode(HttpStatus.OK)
  @Post('board')
  async getBoard(
    @Body() dto: GetBoardDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanRead(user, dto.pageId);
    return this.kanbanService.getBoard(dto.pageId, user.id);
  }

  // ─── Columns ──────────────────────────────────────────────────────────────

  @HttpCode(HttpStatus.OK)
  @Post('columns/create')
  async createColumn(
    @Body() dto: CreateColumnDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWrite(user, dto.pageId);
    return this.kanbanService.createColumn(dto.pageId, dto.name, dto.color);
  }

  @HttpCode(HttpStatus.OK)
  @Post('columns/update')
  async updateColumn(
    @Body() dto: UpdateColumnDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByColumnId(user, dto.columnId);
    return this.kanbanService.updateColumn(
      dto.columnId,
      { name: dto.name, color: dto.color },
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('columns/move')
  async moveColumn(
    @Body() dto: MoveColumnDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByColumnId(user, dto.columnId);
    return this.kanbanService.moveColumn(dto.columnId, dto.position, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('columns/delete')
  async deleteColumn(
    @Body() dto: DeleteColumnDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByColumnId(user, dto.columnId);
    await this.kanbanService.deleteColumn(dto.columnId, user.id);
  }

  // ─── Cards ────────────────────────────────────────────────────────────────

  @HttpCode(HttpStatus.OK)
  @Post('cards/create')
  async createCard(
    @Body() dto: CreateCardDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByColumnId(user, dto.columnId);
    return this.kanbanService.createCard(dto.columnId, dto.title, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('cards/update')
  async updateCard(
    @Body() dto: UpdateCardDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByCardId(user, dto.cardId);
    return this.kanbanService.updateCard(
      dto.cardId,
      { title: dto.title, description: dto.description, priority: dto.priority },
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('cards/move')
  async moveCard(
    @Body() dto: MoveCardDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByCardId(user, dto.cardId);
    return this.kanbanService.moveCard(
      dto.cardId,
      dto.columnId,
      dto.position,
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('cards/delete')
  async deleteCard(
    @Body() dto: DeleteCardDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByCardId(user, dto.cardId);
    await this.kanbanService.deleteCard(dto.cardId, user.id);
  }

  // ─── Assignees ────────────────────────────────────────────────────────────

  @HttpCode(HttpStatus.OK)
  @Post('cards/assignees/add')
  async addAssignee(
    @Body() dto: CardAssigneeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByCardId(user, dto.cardId);
    await this.kanbanService.addAssignee(
      dto.cardId,
      dto.userId,
      user.id,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('cards/assignees/remove')
  async removeAssignee(
    @Body() dto: CardAssigneeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanWriteByCardId(user, dto.cardId);
    await this.kanbanService.removeAssignee(dto.cardId, dto.userId, user.id);
  }

  // ─── Permission helpers ───────────────────────────────────────────────────

  private async assertCanRead(user: User, pageId: string): Promise<void> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async assertCanWrite(user: User, pageId: string): Promise<void> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async assertCanWriteByColumnId(
    user: User,
    columnId: string,
  ): Promise<void> {
    const col = await this.kanbanRepo.findColumnById(columnId);
    if (!col) throw new NotFoundException('Column not found');
    await this.assertCanWrite(user, col.pageId);
  }

  private async assertCanWriteByCardId(
    user: User,
    cardId: string,
  ): Promise<void> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    const col = await this.kanbanRepo.findColumnById(card.columnId);
    if (!col) throw new NotFoundException('Column not found');
    await this.assertCanWrite(user, col.pageId);
  }
}
