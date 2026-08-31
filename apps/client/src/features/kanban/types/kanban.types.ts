export type KanbanColor = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';

export interface KanbanAssignee {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export type KanbanPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface IKanbanMilestone {
  id: string;
  pageId: string;
  name: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface IKanbanCategoryOption {
  id: string;
  categoryId: string;
  label: string;
  color: KanbanColor;
  position: number;
}

export interface IKanbanCategory {
  id: string;
  pageId: string;
  name: string;
  icon: string;
  position: number;
  options: IKanbanCategoryOption[];
}

export interface IKanbanCardCategoryValue {
  categoryId: string;
  optionId: string;
}

export interface IKanbanCard {
  id: string;
  columnId: string;
  title: string;
  description: string;
  priority: KanbanPriority | null;
  milestoneId: string | null;
  milestone: { id: string; name: string; dueDate: string } | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  assignees: KanbanAssignee[];
  categoryValues: IKanbanCardCategoryValue[];
}

export interface IKanbanColumn {
  id: string;
  pageId: string;
  name: string;
  color: KanbanColor;
  position: number;
  createdAt: string;
  updatedAt: string;
  cards: IKanbanCard[];
}

export interface MoveCardPayload {
  cardId: string;
  columnId: string;
  position: number;
}

export interface MoveColumnPayload {
  columnId: string;
  position: number;
}
