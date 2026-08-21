import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ResendVerificationDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  sig: string;
}
