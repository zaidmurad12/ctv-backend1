import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AllExceptionsFilter } from './common/filters/allExceptionsFilter.js';
import { JwtAuthGuard } from './common/guards/jwtAuthGuard.js';
import { RolesGuard } from './common/guards/rolesGuard.js';
import { ResponseInterceptor } from './common/interceptors/responseInterceptor.js';
import { BackendConfigModule } from './config/backendConfigModule.js';
import { ContinueWatchingModule } from './continue-watching/continueWatching.module.js';
import { FavoritesModule } from './favorites/favorites.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prismaModule.js';
import { SearchModule } from './search/search.module.js';
import { UsersModule } from './users/users.module.js';
import { WatchHistoryModule } from './watch-history/watchHistory.module.js';

@Module({
  imports: [
    BackendConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    UsersModule,
    CatalogModule,
    SearchModule,
    FavoritesModule,
    WatchHistoryModule,
    ContinueWatchingModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class AppModule {}
