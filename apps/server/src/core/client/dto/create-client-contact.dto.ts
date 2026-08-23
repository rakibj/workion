import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateClientContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }: TransformFnParams) => value?.trim() || undefined)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams) => value?.trim() || undefined)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
