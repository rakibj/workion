import {
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSpaceInviteLinkDto {
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsIn(['none', 'reader', 'writer'])
  spaceRole: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxUses?: number;
}

export class DeleteSpaceInviteLinkDto {
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsNotEmpty()
  @IsUUID()
  linkId: string;
}

export class GetSpaceInviteLinksDto {
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;
}

export class GuestSignupDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsNotEmpty()
  @IsString()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}

export class GuestJoinDto {
  @IsNotEmpty()
  @IsString()
  token: string;
}
