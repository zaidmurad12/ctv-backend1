import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { BcryptPasswordHasher, JwtTokenService } from './infrastructure/authServices.js';
import {
  PrismaRefreshTokenRepository,
  PrismaUserRepository,
} from './infrastructure/prismaAuthRepositories.js';
import {
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './ports.js';
import { JwtStrategy } from './strategies/jwtStrategy.js';
import { AuthUseCases } from './useCases.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthUseCases,
    JwtStrategy,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
  ],
  exports: [AuthUseCases, USER_REPOSITORY, PASSWORD_HASHER],
})
export class AuthModule {}
