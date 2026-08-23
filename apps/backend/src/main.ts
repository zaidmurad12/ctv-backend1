import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { createBackendConfig } from './config/backendConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// apps/backend/dist/main.js -> repo root, where the shared .env lives.
function loadRootEnv(): void {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
  } catch {
    // No .env file (e.g. real environment variables are already set) — proceed.
  }
}

async function bootstrap(): Promise<void> {
  loadRootEnv();
  const config = createBackendConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // `cross-origin` (not the default `same-origin`) so static assets under
  // /static (subtitles, artwork) can be loaded by a frontend on another port.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') });
  app.setGlobalPrefix(config.apiPrefix.replace(/^\//, ''));

  // apps/backend/dist/main.js -> repo root -> storage/. Serves demo subtitles
  // (and any future importer artwork) outside the API prefix so player <track>
  // URLs work with a plain static path, not versioned API routes.
  app.useStaticAssets(path.resolve(__dirname, '../../../storage'), { prefix: '/static/' });

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('CTV Platform API')
        .setDescription('REST API for the CTV Platform — see specification/09-Backend-API.md.txt')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${config.apiPrefix.replace(/^\//, '')}/docs`, app, document);
  }

  await app.listen(config.port, config.host);
}

void bootstrap();
