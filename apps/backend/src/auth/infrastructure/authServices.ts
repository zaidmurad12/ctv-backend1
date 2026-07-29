import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { BackendConfig } from '../../config/backendConfig.js';
import { BACKEND_CONFIG } from '../../config/backendConfigModule.js';
import type { AccessTokenPayload, PasswordHasher, TokenService } from '../ports.js';

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(@Inject(BACKEND_CONFIG) private readonly config: BackendConfig) {}

  hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, this.config.bcryptSaltRounds);
  }

  verify(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}

const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;
const UNIT_TO_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseDurationMs(duration: string): number {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected e.g. "15m" or "30d".`);
  }
  return Number(match[1]) * UNIT_TO_MS[match[2]];
}

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(BACKEND_CONFIG) private readonly config: BackendConfig,
  ) {}

  issueAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessExpiresIn,
    });
  }

  issueRefreshToken(): { token: string; expiresAt: Date } {
    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + parseDurationMs(this.config.jwt.refreshExpiresIn));
    return { token, expiresAt };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
