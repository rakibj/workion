import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PROJECT_STATUSES, ProjectStatus } from './project-status';

export class ListProjectsDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;
}
