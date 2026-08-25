import { IsOptional, IsString, MinLength } from 'class-validator';

export class SaveAiKeyDto {
  // Optional so the model can be updated alone once a key is already
  // configured — see AiKeyService.saveKey.
  @IsOptional()
  @IsString()
  @MinLength(1)
  apiKey?: string;

  @IsOptional()
  @IsString()
  model?: string;
}
