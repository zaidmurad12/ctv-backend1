import { Module } from '@nestjs/common';
import { FavoriteRepository } from './infrastructure/favoriteRepository.js';
import { FavoritesController } from './favorites.controller.js';
import { FavoritesUseCases } from './useCases.js';

@Module({
  controllers: [FavoritesController],
  providers: [FavoriteRepository, FavoritesUseCases],
})
export class FavoritesModule {}
