import {
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class VerificationInfoDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;
}

export class CreateVerificationDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsIn(['expiring', 'qms'])
  @IsOptional()
  type?: string;

  @IsString()
  @IsIn(['period', 'fixed', 'indefinite'])
  @IsOptional()
  mode?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  periodAmount?: number;

  @IsString()
  @IsIn(['day', 'week', 'month', 'year'])
  @IsOptional()
  periodUnit?: string;

  @IsISO8601()
  @IsOptional()
  fixedExpiresAt?: string;

  @IsArray()
  @IsUUID('all', { each: true })
  verifierIds: string[];
}

export class UpdateVerificationDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsIn(['period', 'fixed', 'indefinite'])
  @IsOptional()
  mode?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  periodAmount?: number;

  @IsString()
  @IsIn(['day', 'week', 'month', 'year'])
  @IsOptional()
  periodUnit?: string;

  @IsISO8601()
  @IsOptional()
  fixedExpiresAt?: string;

  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  verifierIds?: string[];
}

export class RejectApprovalDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsOptional()
  comment?: string;
}

export class VerificationListDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  spaceIds?: string[];

  @IsUUID()
  @IsOptional()
  verifierId?: string;

  @IsString()
  @IsIn(['expiring', 'qms'])
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  cursor?: string;

  @IsString()
  @IsOptional()
  beforeCursor?: string;

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  query?: string;
}
