import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticatedUser.js';
import { CurrentUser } from '../common/decorators/decorators.js';
import { RecordHistoryDto } from './dto.js';
import type { HistoryResponseDto } from './dto.js';
import { WatchHistoryUseCases } from './useCases.js';

@ApiTags('watch-history')
@ApiBearerAuth()
@Controller('history')
export class WatchHistoryController {
  constructor(private readonly historyUseCases: WatchHistoryUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List recent watch history' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<HistoryResponseDto[]> {
    return this.historyUseCases.list(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Record playback progress' })
  async record(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordHistoryDto,
  ): Promise<{ id: string }> {
    const id = await this.historyUseCases.record(user.userId, dto);
    return { id };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete()
  @ApiOperation({ summary: 'Clear all watch history' })
  async clear(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.historyUseCases.clear(user.userId);
  }
}
