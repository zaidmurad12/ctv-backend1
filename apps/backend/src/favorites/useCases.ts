import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AddFavoriteDto, FavoriteResponseDto } from './dto.js';
import { FavoriteRepository } from './infrastructure/favoriteRepository.js';

@Injectable()
export class FavoritesUseCases {
  constructor(private readonly favorites: FavoriteRepository) {}

  async add(userId: string, dto: AddFavoriteDto): Promise<string> {
    if (Boolean(dto.movieId) === Boolean(dto.showId)) {
      throw new BadRequestException('Provide exactly one of movieId or showId.');
    }
    return this.favorites.add(userId, dto.movieId, dto.showId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const removed = await this.favorites.remove(userId, id);
    if (removed === 0) {
      throw new NotFoundException('Favorite not found.');
    }
  }

  list(userId: string): Promise<FavoriteResponseDto[]> {
    return this.favorites.list(userId);
  }
}
