import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KanbanRepo,
  KanbanColumnWithCards,
  KanbanCategoryWithOptions,
} from '@docmost/db/repos/kanban/kanban.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import {
  KanbanCard,
  KanbanColumn,
  KanbanMilestone,
  KanbanCategory,
  KanbanCategoryOption,
} from '@docmost/db/types/entity.types';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';

const POSITION_STEP = 1000;

@Injectable()
export class KanbanService {
  constructor(
    private readonly kanbanRepo: KanbanRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE) private readonly notificationQueue: Queue,
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
    const card = await this.kanbanRepo.createCard({
      columnId,
      title,
      description: '',
      position: maxPos + POSITION_STEP,
    });
    await this.queueBoardUpdateNotification(column.pageId, userId);
    return card;
  }

  async updateCard(
    cardId: string,
    data: {
      title?: string;
      description?: string;
      priority?: string | null;
      milestoneId?: string | null;
      dueDate?: string | null;
    },
    userId: string,
  ): Promise<KanbanCard> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    const updateData = {
      ...data,
      dueDate: data.dueDate === undefined ? undefined : data.dueDate === null ? null : new Date(data.dueDate),
    };
    const updated = await this.kanbanRepo.updateCard(cardId, updateData);
    const column = await this.kanbanRepo.findColumnById(card.columnId);
    if (column) await this.queueBoardUpdateNotification(column.pageId, userId);
    return updated;
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
    const updated = await this.kanbanRepo.updateCard(cardId, { columnId, position });
    await this.queueBoardUpdateNotification(column.pageId, userId);
    return updated;
  }

  async deleteCard(cardId: string, userId: string): Promise<void> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    const column = await this.kanbanRepo.findColumnById(card.columnId);
    await this.kanbanRepo.deleteCard(cardId);
    if (column) await this.queueBoardUpdateNotification(column.pageId, userId);
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

  // ─── Categories ─────────────────────────────────────────────────────────────

  async getCategories(pageId: string): Promise<KanbanCategoryWithOptions[]> {
    await this.assertKanbanPage(pageId);
    return this.kanbanRepo.getCategoriesByPageId(pageId);
  }

  async createCategory(
    pageId: string,
    name: string,
    icon: string,
  ): Promise<KanbanCategory> {
    await this.assertKanbanPage(pageId);
    const maxPos = await this.kanbanRepo.getMaxCategoryPosition(pageId);
    return this.kanbanRepo.createCategory({
      pageId,
      name,
      icon,
      position: maxPos + POSITION_STEP,
    });
  }

  async updateCategory(
    categoryId: string,
    data: { name?: string; icon?: string },
  ): Promise<KanbanCategory> {
    const category = await this.kanbanRepo.findCategoryById(categoryId);
    if (!category) throw new NotFoundException('Category not found');
    return this.kanbanRepo.updateCategory(categoryId, data);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const category = await this.kanbanRepo.findCategoryById(categoryId);
    if (!category) throw new NotFoundException('Category not found');
    await this.kanbanRepo.deleteCategory(categoryId);
  }

  // ─── Category options ───────────────────────────────────────────────────────

  async createCategoryOption(
    categoryId: string,
    label: string,
    color = 'gray',
  ): Promise<KanbanCategoryOption> {
    const category = await this.kanbanRepo.findCategoryById(categoryId);
    if (!category) throw new NotFoundException('Category not found');
    const maxPos = await this.kanbanRepo.getMaxCategoryOptionPosition(categoryId);
    return this.kanbanRepo.createCategoryOption({
      categoryId,
      label,
      color,
      position: maxPos + POSITION_STEP,
    });
  }

  async updateCategoryOption(
    optionId: string,
    data: { label?: string; color?: string; position?: number },
  ): Promise<KanbanCategoryOption> {
    const option = await this.kanbanRepo.findCategoryOptionById(optionId);
    if (!option) throw new NotFoundException('Category option not found');
    return this.kanbanRepo.updateCategoryOption(optionId, data);
  }

  async deleteCategoryOption(optionId: string): Promise<void> {
    const option = await this.kanbanRepo.findCategoryOptionById(optionId);
    if (!option) throw new NotFoundException('Category option not found');
    await this.kanbanRepo.deleteCategoryOption(optionId);
  }

  // ─── Card category values ───────────────────────────────────────────────────

  async setCardCategoryValue(
    cardId: string,
    categoryId: string,
    optionId: string | null,
    userId: string,
  ): Promise<void> {
    const card = await this.kanbanRepo.findCardById(cardId);
    if (!card) throw new NotFoundException('Card not found');
    const category = await this.kanbanRepo.findCategoryById(categoryId);
    if (!category) throw new NotFoundException('Category not found');
    if (optionId !== null) {
      const option = await this.kanbanRepo.findCategoryOptionById(optionId);
      if (!option || option.categoryId !== categoryId) {
        throw new NotFoundException('Category option not found');
      }
    }
    await this.kanbanRepo.setCardCategoryValue(cardId, categoryId, optionId);
    const column = await this.kanbanRepo.findColumnById(card.columnId);
    if (column) await this.queueBoardUpdateNotification(column.pageId, userId);
  }

  // ─── Assignable members ────────────────────────────────────────────────────

  async getAssignableMembers(
    pageId: string,
  ): Promise<{ id: string; name: string; email: string; avatarUrl: string | null }[]> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(pageId);

    if (!pageAccess) {
      return this.spaceMemberRepo.getSpaceUsersWithEditAccess(page.spaceId);
    }

    // Page is restricted — return only users who have an explicit page permission
    const directUsers = await this.db
      .selectFrom('pagePermissions')
      .innerJoin('users', 'users.id', 'pagePermissions.userId')
      .select(['users.id', 'users.name', 'users.email', 'users.avatarUrl'])
      .where('pagePermissions.pageAccessId', '=', pageAccess.id)
      .where('pagePermissions.userId', 'is not', null)
      .where('users.deletedAt', 'is', null)
      .execute();

    const viaGroupUsers = await this.db
      .selectFrom('pagePermissions')
      .innerJoin('groupUsers', 'groupUsers.groupId', 'pagePermissions.groupId')
      .innerJoin('users', 'users.id', 'groupUsers.userId')
      .select(['users.id', 'users.name', 'users.email', 'users.avatarUrl'])
      .where('pagePermissions.pageAccessId', '=', pageAccess.id)
      .where('pagePermissions.groupId', 'is not', null)
      .where('users.deletedAt', 'is', null)
      .execute();

    const seen = new Set<string>();
    return [...directUsers, ...viaGroupUsers].filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async queueBoardUpdateNotification(
    pageId: string,
    userId: string,
  ): Promise<void> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) return;
    await this.notificationQueue
      .add(QueueJob.PAGE_UPDATED, {
        pageId,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorIds: [userId],
      })
      .catch(() => {});
  }

  private async assertKanbanPage(pageId: string): Promise<void> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    if (page.type !== 'kanban') {
      throw new ForbiddenException('Page is not a kanban board');
    }
  }
}
