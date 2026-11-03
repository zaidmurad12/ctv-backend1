import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
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
  // Nest's own default body parser (registered automatically unless disabled here) uses
  // body-parser's stock 100kb limit - fine for every other endpoint, but the admin panel's
  // subtitle-upload feature posts a whole .srt/.vtt file's text as one JSON field, and a real
  // movie's subtitle routinely exceeds that on its own (reported as "won't accept subtitle file
  // uploads" - a plain 413 rejected before the request ever reached the controller). Disabling
  // the automatic one and registering these instead is the documented way to raise that limit.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Cloud Run terminates TLS at its own edge and forwards plain HTTP internally, with the original
  // scheme only preserved in X-Forwarded-Proto - without this, req.protocol (used by
  // AppUpdateController to build the APK's own download URL) always reads back "http", which the
  // app's Settings screen would then hand to Linking.openURL as an insecure link.
  app.set('trust proxy', true);
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // `cross-origin` (not the default `same-origin`) so static assets under
  // /static (subtitles, artwork) can be loaded by a frontend on another port.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') });
  app.setGlobalPrefix(config.apiPrefix.replace(/^\//, ''));

  // apps/backend/dist/main.js -> repo root -> storage/. Serves demo subtitles
  // (and any future importer artwork) outside the API prefix so player <track>
  // URLs work with a plain static path, not versioned API routes.
  app.useStaticAssets(path.resolve(__dirname, '../../../storage'), { prefix: '/static/' });

  // apps/backend/dist/main.js -> apps/backend -> release-assets/. The latest release APK the
  // Android TV app's own Settings screen offers as an in-app update - see
  // app-update/appVersion.ts for the version numbers this file must match, and this same
  // release-assets folder's own note for how a new build gets published here. Plain static
  // serving (not a custom download endpoint) gets range-request/resume support for a large file
  // for free.
  app.useStaticAssets(path.resolve(__dirname, '../release-assets'), { prefix: '/downloads/' });

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
