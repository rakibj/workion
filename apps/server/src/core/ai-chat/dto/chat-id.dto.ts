import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ChatIdDto {
  @IsUUID()
  chatId: string;
}

export class UpdateChatDto {
  @IsUUID()
  chatId: string;

  @IsString()
  @MinLength(1)
  title: string;
}

export class SearchChatDto {
  @IsString()
  @MinLength(1)
  query: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
