import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticatedUser.js';
import { CurrentUser } from '../common/decorators/decorators.js';
import { UpsertContinueWatchingDto } from './dto.js';
import type { ContinueWatchingResponseDto } from './dto.js';
import { ContinueWatchingUseCases } from './useCases.js';

@ApiTags('continue-watching')
@ApiBearerAuth()
@Controller('continue')
export class ContinueWatchingController {
  constructor(private readonly continueWatchingUseCases: ContinueWatchingUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List in-progress content' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ContinueWatchingResponseDto[]> {
    return this.continueWatchingUseCases.list(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Update (or create) the continue-watching position for a title' })
  async upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertContinueWatchingDto,
  ): Promise<{ id: string }> {
    const id = await this.continueWatchingUseCases.upsert(user.userId, dto);
    return { id };
  }
}
