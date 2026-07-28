import { IsBoolean, IsOptional } from 'class-validator';

export class PublishBlogPostDto {
  @IsOptional()
  @IsBoolean()
  robotsIndex?: boolean;
}
