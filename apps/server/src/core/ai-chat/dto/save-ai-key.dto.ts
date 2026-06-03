import { IsOptional, IsString, MinLength } from 'class-validator';

export class SaveAiKeyDto {
  @IsString()
  @MinLength(1)
  apiKey: string;

  @IsOptional()
  @IsString()
  model?: string;
}
