import { IsUUID } from 'class-validator';

export class AddClientMemberDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  spaceId: string;
}
