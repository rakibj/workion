import { IsOptional, IsString, IsUUID, IsNumber, IsPositive, Min, Max } from 'class-validator';

export class TemplateListDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  query?: string;
}

export class TemplateInfoDto {
  @IsUUID()
  templateId: string;
}

export class CreateTemplateDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  content?: any;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class UpdateTemplateDto {
  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  content?: any;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class DeleteTemplateDto {
  @IsUUID()
  templateId: string;
}

export class UseTemplateDto {
  @IsUUID()
  templateId: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsUUID()
  parentPageId?: string;
}
