import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsUUID()
  spaceId: string;
}
