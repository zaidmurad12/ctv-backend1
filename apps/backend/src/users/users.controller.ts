import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticatedUser.js';
import { CurrentUser } from '../common/decorators/decorators.js';
import { UserResponseDto } from '../auth/dto.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto.js';
import { UsersUseCases } from './useCases.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersUseCases: UsersUseCases) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user’s profile' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    const fullUser = await this.usersUseCases.getById(user.userId);
    return new UserResponseDto(fullUser);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user’s profile' })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const updated = await this.usersUseCases.updateProfile(user.userId, dto);
    return new UserResponseDto(updated);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('me/password')
  @ApiOperation({ summary: 'Change the authenticated user’s password' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersUseCases.changePassword(user.userId, dto);
  }
}
