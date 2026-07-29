import { randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConflictError, NotFoundError } from '@ctv-platform/domain';
import { PlainTextPassword } from './domain/valueObjects.js';
import { User } from './domain/user.js';
import {
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
  type PasswordHasher,
  type RefreshTokenRepository,
  type TokenService,
  type UserRepository,
} from './ports.js';

export interface Session {
  readonly user: User;
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * All authentication business logic. Controllers depend on this, never on
 * Prisma or the token/hashing libraries directly.
 */
@Injectable()
export class AuthUseCases {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  async register(input: { email: string; username: string; password: string }): Promise<Session> {
    PlainTextPassword.create(input.password);

    if (await this.users.findByEmail(input.email)) {
      throw new ConflictError('An account with this email already exists.');
    }
    if (await this.users.findByUsername(input.username)) {
      throw new ConflictError('This username is already taken.');
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = User.create({
      id: randomUUID(),
      email: input.email,
      username: input.username,
      passwordHash,
      role: 'VIEWER',
    });
    await this.users.save(user);

    return this.issueSession(user);
  }

  async login(input: { email: string; password: string }): Promise<Session> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!(await this.hasher.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<Session> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const user = await this.users.findById(stored.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Refresh token rotation: the presented token is single-use.
    await this.refreshTokens.revoke(stored.id);
    return this.issueSession(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);
    if (stored) {
      await this.refreshTokens.revoke(stored.id);
    }
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  private async issueSession(user: User): Promise<Session> {
    const accessToken = this.tokens.issueAccessToken({
      sub: user.id,
      email: user.email.value,
      role: user.role,
    });
    const { token: refreshToken, expiresAt } = this.tokens.issueRefreshToken();
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    await this.refreshTokens.create(user.id, tokenHash, expiresAt);
    return { user, accessToken, refreshToken };
  }
}
