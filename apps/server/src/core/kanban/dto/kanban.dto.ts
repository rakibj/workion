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
