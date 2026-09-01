import { z } from 'zod';

const backendConfigSchema = z.object({
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_HOST: z.string().min(1).default('0.0.0.0'),
  API_PREFIX: z.string().min(1).default('/api/v1'),
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  CORS_ORIGIN: z.string().min(1).default('*'),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES: z.string().min(1).default('15m'),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_REFRESH_EXPIRES: z.string().min(1).default('30d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
});

export interface BackendConfig {
  readonly port: number;
  readonly host: string;
  readonly apiPrefix: string;
  readonly swaggerEnabled: boolean;
  readonly corsOrigin: string;
  readonly jwt: {
    readonly accessSecret: string;
    readonly accessExpiresIn: string;
    readonly refreshSecret: string;
    readonly refreshExpiresIn: string;
  };
  readonly bcryptSaltRounds: number;
}

export function createBackendConfig(
  values: Record<string, string | undefined> = process.env,
): BackendConfig {
  const parsed = backendConfigSchema.parse(values);
  return {
    port: parsed.APP_PORT,
    host: parsed.APP_HOST,
    apiPrefix: parsed.API_PREFIX,
    swaggerEnabled: parsed.SWAGGER_ENABLED,
    corsOrigin: parsed.CORS_ORIGIN,
    jwt: {
      accessSecret: parsed.JWT_SECRET,
      accessExpiresIn: parsed.JWT_EXPIRES,
      refreshSecret: parsed.JWT_REFRESH_SECRET,
      refreshExpiresIn: parsed.JWT_REFRESH_EXPIRES,
    },
    bcryptSaltRounds: parsed.BCRYPT_SALT_ROUNDS,
  };
}
