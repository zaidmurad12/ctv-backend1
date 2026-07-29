import { Global, Module } from '@nestjs/common';
import { createBackendConfig } from './backendConfig.js';

export const BACKEND_CONFIG = Symbol('BACKEND_CONFIG');

@Global()
@Module({
  providers: [{ provide: BACKEND_CONFIG, useFactory: createBackendConfig }],
  exports: [BACKEND_CONFIG],
})
export class BackendConfigModule {}
