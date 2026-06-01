import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KanbanRepo, KanbanColumnWithCards } from '@docmost/db/repos/kanban/kanban.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import {
  KanbanCard,
  KanbanColumn,
  KanbanMilestone,
} from '@docmost/db/types/entity.types';

const POSITION_STEP = 1000;

@Injectable()
export class KanbanService {
  constructor(
    private readonly kanbanRepo: KanbanRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  // ─── Board ─────────────────────────────────────────────────────────────────

  async getBoard(
    pageId: string,
    userId: string,
  ): Promise<KanbanColumnWithCards[]> {
    await this.assertKanbanPage(pageId);
    return this.kanbanRepo.getBoardByPageId(pageId);
  }

  async initDefaultColumns(pageId: string): Promise<void> {
    const defaults = [
      { name: 'To Do', color: 'gray', position: POSITION_STEP },
      { name: 'In Progress', color: 'blue', position: POSITION_STEP * 2 },
      { name: 'Done', color: 'green', position: POSITION_STEP * 3 },
    ];
    await executeTx(this.db, async (trx) => {
      for (const col of defaults) {
        await this.kanbanRepo.createColumn({ pageId, ...col }, trx);
      }
    });
  }

  // ─── Columns ───────────────────────────────────────────────────────────────

  async createColumn(
    pageId: string,
    name: string,
    color = 'gray',
  ): Promise<KanbanColumn> {
    await this.assertKanbanPage(pageId);
    const maxPos = await this.kanbanRepo.getMaxColumnPosition(pageId);
    return this.kanbanRepo.createColumn({
      pageId,
      name,
      color,
      position: maxPos + POSITION_STEP,
    });
  }

  async updateColumn(
    columnId: string,
    data: { name?: string; color?: string },
    userId: string,
  ): Promise<KanbanColumn> {
    const column = await this.kanbanRepo.findColumnById(columnId);
    if (!column) throw new NotFoundException('Column not found');
    return this.kanbanRepo.updateColumn(columnId, data);
  }

  async moveColumn(
    columnId: string,
    position: number,
    userId: string,
  ): Promise<KanbanColumn> {
    const column = await this.kanbanRepo.findColumnById(columnId);
    if (!column) throw new NotFoundException('Column not found');
    return this.kanbanRepo.updateColumn(columnId, { position });
  }

  async deleteColumn(columnId: string, userId: string): Promise<void> {
    const column = await this.kanbanRepo.findColumnById(columnId);
    if (!column) throw new NotFoundException('Column not found');
    await this.kanbanRepo.deleteColumn(columnId);
  }

  // ─── Cards ─────────────────────────────────────────────────────────────────

  async createCard(
    columnId: string,
    title: string,
    userId: string,
  ): Promise<KanbanCard> {
    const column = await this.kanbanRepo.findColumnById(columnId);
    if (!column) throw new NotFoundException('Column not found');
    const maxPos = await this.kanbanRepo.getMaxCardPosition(columnId);
    return this.kanbanRepo.createCard({
      columnId,
      title,
      description: '',
      position: maxPos + POSITION_STEP,
    });
  }

  async updateCard(
    cardId: string,
    data: { title?: string; description?: string; priority?: string; milestoneId?: string | null },
    userId: string,
  ): Promise<KanbanCard> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    return this.kanbanRepo.updateCard(cardId, data);
  }

  async moveCard(
    cardId: string,
    columnId: string,
    position: number,
    userId: string,
  ): Promise<KanbanCard> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    const column = await this.kanbanRepo.findColumnById(columnId);
    if (!column) throw new NotFoundException('Column not found');
    return this.kanbanRepo.updateCard(cardId, { columnId, position });
  }

  async deleteCard(cardId: string, userId: string): Promise<void> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    await this.kanbanRepo.deleteCard(cardId);
  }

  // ─── Assignees ─────────────────────────────────────────────────────────────

  async addAssignee(
    cardId: string,
    targetUserId: string,
    requesterId: string,
    workspaceId: string,
  ): Promise<void> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    await this.kanbanRepo.addAssignee(cardId, targetUserId);
  }

  async removeAssignee(
    cardId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<void> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    await this.kanbanRepo.removeAssignee(cardId, targetUserId);
  }

  // ─── Milestones ────────────────────────────────────────────────────────────

  async getMilestones(pageId: string): Promise<KanbanMilestone[]> {
    await this.assertKanbanPage(pageId);
    return this.kanbanRepo.getMilestonesByPageId(pageId);
  }

  async createMilestone(
    pageId: string,
    name: string,
    dueDate: string,
  ): Promise<KanbanMilestone> {
    await this.assertKanbanPage(pageId);
    return this.kanbanRepo.createMilestone({ pageId, name, dueDate: new Date(dueDate) });
  }

  async updateMilestone(
    milestoneId: string,
    data: { name?: string; dueDate?: string },
  ): Promise<KanbanMilestone> {
    const milestone = await this.kanbanRepo.findMilestoneById(milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    const updateData: Partial<Pick<KanbanMilestone, 'name' | 'dueDate'>> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
    return this.kanbanRepo.updateMilestone(milestoneId, updateData);
  }

  async deleteMilestone(milestoneId: string): Promise<void> {
    const milestone = await this.kanbanRepo.findMilestoneById(milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    await this.kanbanRepo.deleteMilestone(milestoneId);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertKanbanPage(pageId: string): Promise<void> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    if (page.type !== 'kanban') {
      throw new ForbiddenException('Page is not a kanban board');
    }
  }
}
