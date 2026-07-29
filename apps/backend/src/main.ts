import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { createBackendConfig } from './config/backendConfig.js';

async function bootstrap(): Promise<void> {
  const config = createBackendConfig();
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') });
  app.setGlobalPrefix(config.apiPrefix.replace(/^\//, ''));

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
