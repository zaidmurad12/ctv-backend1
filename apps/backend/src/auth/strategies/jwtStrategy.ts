import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../common/auth/authenticatedUser.js';
import type { BackendConfig } from '../../config/backendConfig.js';
import { BACKEND_CONFIG } from '../../config/backendConfigModule.js';
import type { AccessTokenPayload } from '../ports.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(BACKEND_CONFIG) config: BackendConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role as AuthenticatedUser['role'],
    };
  }
}
