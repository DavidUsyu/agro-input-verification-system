import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './config/configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  configureApp(app);
  const port = config.getOrThrow<number>('PORT');
  const host = config.getOrThrow<string>('HOST');
  await app.listen(port, host);
  Logger.log(`API listening at http://${host}:${port}/api`, 'Bootstrap');
}

bootstrap().catch(() => {
  Logger.error('API startup failed. Check configuration and whether the port is available.', undefined, 'Bootstrap');
  process.exitCode = 1;
});
