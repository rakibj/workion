import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
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
