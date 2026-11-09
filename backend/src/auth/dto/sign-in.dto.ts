import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignInDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // No complexity rules here: sign-in must not reveal the password policy,
  // it only checks the submitted password against the stored hash.
  @ApiProperty({ example: 'Str0ng!Pass', format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
