import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export enum ExportFormat {
  HTML = 'html',
  Markdown = 'markdown',
  Docx = 'docx',
}

export class ExportPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsIn(['html', 'markdown', 'docx'])
  format: ExportFormat;

  @IsOptional()
  @IsBoolean()
  includeChildren?: boolean;

  @IsOptional()
  @IsBoolean()
  includeAttachments?: boolean;
}

export class ExportSpaceDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsString()
  @IsIn(['html', 'markdown'])
  format: ExportFormat;

  @IsOptional()
  @IsBoolean()
  includeAttachments?: boolean;
}

export class ExportSpaceTextDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;
}

export class ExportSharedPageDto {
  @IsString()
  @IsNotEmpty()
  shareId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsIn(['html', 'markdown', 'docx'])
  format: ExportFormat;
}