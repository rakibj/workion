import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { Transform, TransformFnParams } from 'class-transformer';
import { NoUrls } from '../../../common/validators/no-urls.validator';

export class CreateAdminUserDto extends CreateUserDto {
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  @NoUrls()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  @IsString()
  @Transform(({ value }: TransformFnParams) => {
    // The cloud signup form (SetupWorkspaceForm) doesn't collect this field
    // and submits "" rather than omitting the key — treat that the same as
    // not provided so @IsOptional() actually applies, instead of tripping
    // @MinLength(1). Callers fall back to a default workspace name.
    const trimmed = value?.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  workspaceName: string;

  @IsOptional()
  @MinLength(4)
  @MaxLength(50)
  @IsString()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  hostname?: string;
}
