import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  chatId?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  mentionedPageIds?: string[];

  @IsOptional()
  @IsUUID()
  contextPageId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}
