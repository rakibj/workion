import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

// Preset icon set for board categories — same outline/stroke style as the
// existing IconFlag/IconTarget badges. Kept in sync with CATEGORY_ICONS on
// the client (kanban-board-page.tsx).
export const CATEGORY_ICONS = [
  'IconTag',
  'IconBookmark',
  'IconStar',
  'IconBolt',
  'IconBug',
  'IconClipboardList',
  'IconUsers',
  'IconCalendarEvent',
  'IconAlarm',
  'IconCircleCheck',
  'IconCircleDot',
  'IconHash',
  'IconRocket',
  'IconPalette',
  'IconCode',
  'IconShieldCheck',
] as const;

const KANBAN_OPTION_COLORS = ['gray', 'blue', 'green', 'yellow', 'red', 'purple'];

export class GetBoardDto {
  @IsUUID()
  pageId: string;
}

export class CreateColumnDto {
  @IsUUID()
  pageId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsIn(['gray', 'blue', 'green', 'yellow', 'red', 'purple'])
  color?: string;
}

export class UpdateColumnDto {
  @IsUUID()
  columnId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['gray', 'blue', 'green', 'yellow', 'red', 'purple'])
  color?: string;
}

export class MoveColumnDto {
  @IsUUID()
  columnId: string;

  @IsNumber()
  @Min(0)
  position: number;
}

export class DeleteColumnDto {
  @IsUUID()
  columnId: string;
}

export class CreateCardDto {
  @IsUUID()
  columnId: string;

  @IsString()
  title: string;
}

export class UpdateCardDto {
  @IsUUID()
  cardId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['urgent', 'high', 'medium', 'low'])
  priority?: string;

  @IsOptional()
  @ValidateIf((o) => o.milestoneId !== null && o.milestoneId !== undefined)
  @IsUUID()
  milestoneId?: string | null;
}

export class MoveCardDto {
  @IsUUID()
  cardId: string;

  @IsUUID()
  columnId: string;

  @IsNumber()
  @Min(0)
  position: number;
}

export class DeleteCardDto {
  @IsUUID()
  cardId: string;
}

export class CardAssigneeDto {
  @IsUUID()
  cardId: string;

  @IsUUID()
  userId: string;
}

export class ListMilestonesDto {
  @IsUUID()
  pageId: string;
}

export class CreateMilestoneDto {
  @IsUUID()
  pageId: string;

  @IsString()
  name: string;

  @IsDateString()
  dueDate: string;
}

export class UpdateMilestoneDto {
  @IsUUID()
  milestoneId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class DeleteMilestoneDto {
  @IsUUID()
  milestoneId: string;
}

export class GetAssignableMembersDto {
  @IsUUID()
  pageId: string;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export class ListCategoriesDto {
  @IsUUID()
  pageId: string;
}

export class CreateCategoryDto {
  @IsUUID()
  pageId: string;

  @IsString()
  name: string;

  @IsIn(CATEGORY_ICONS)
  icon: string;
}

export class UpdateCategoryDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(CATEGORY_ICONS)
  icon?: string;
}

export class DeleteCategoryDto {
  @IsUUID()
  categoryId: string;
}

export class CreateCategoryOptionDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsIn(KANBAN_OPTION_COLORS)
  color?: string;
}

export class UpdateCategoryOptionDto {
  @IsUUID()
  optionId: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(KANBAN_OPTION_COLORS)
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  position?: number;
}

export class DeleteCategoryOptionDto {
  @IsUUID()
  optionId: string;
}

export class SetCardCategoryDto {
  @IsUUID()
  cardId: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @ValidateIf((o) => o.optionId !== null && o.optionId !== undefined)
  @IsUUID()
  optionId?: string | null;
}
