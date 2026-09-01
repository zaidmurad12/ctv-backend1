import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { User } from './domain/user.js';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 3 })
  @IsString()
  @MinLength(3)
  username!: string;

  @ApiProperty({
    minLength: 12,
    description: 'Must contain upper/lowercase, a number, and a special character.',
  })
  @IsString()
  @MinLength(12)
  password!: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  constructor(user: User) {
    this.id = user.id;
    this.email = user.email.value;
    this.username = user.username.value;
    this.role = user.role;
    this.isActive = user.isActive;
    this.createdAt = user.createdAt.toISOString();
  }
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  constructor(accessToken: string, refreshToken: string, user: User) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.user = new UserResponseDto(user);
  }
}
