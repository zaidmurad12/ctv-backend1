import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticatedUser.js';
import { CurrentUser } from '../common/decorators/decorators.js';
import { AddFavoriteDto } from './dto.js';
import type { FavoriteResponseDto } from './dto.js';
import { FavoritesUseCases } from './useCases.js';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesUseCases: FavoritesUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user’s favorites' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<FavoriteResponseDto[]> {
    return this.favoritesUseCases.list(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a movie or show to favorites' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddFavoriteDto,
  ): Promise<{ id: string }> {
    const id = await this.favoritesUseCases.add(user.userId, dto);
    return { id };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  @ApiOperation({ summary: 'Remove a favorite' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.favoritesUseCases.remove(user.userId, id);
  }
}
