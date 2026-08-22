import { IsUUID } from 'class-validator';

export class LinkClientSpaceDto {
  @IsUUID()
  spaceId: string;
}
