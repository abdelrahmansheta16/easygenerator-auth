import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SignUpDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace', minLength: 3, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(3, 100, { message: 'Name must be at least 3 characters long.' })
  name!: string;

  @ApiProperty({
    example: 'Str0ng!Pass',
    description:
      'Minimum 8 characters, at least one letter, one number and one special character.',
    minLength: 8,
    format: 'password',
  })
  @IsString()
  @Length(8, 128, { message: 'Password must be at least 8 characters long.' })
  @Matches(/[A-Za-z]/, {
    message: 'Password must contain at least one letter.',
  })
  @Matches(/[0-9]/, { message: 'Password must contain at least one number.' })
  @Matches(/[^A-Za-z0-9]/, {
    message: 'Password must contain at least one special character.',
  })
  password!: string;
}
