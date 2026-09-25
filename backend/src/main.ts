import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.getOrThrow<string>('FRONTEND_ORIGIN'), credentials: true });
  app.enableShutdownHooks();
  const port = config.getOrThrow<number>('PORT');
  const host = config.getOrThrow<string>('HOST');
  await app.listen(port, host);
  Logger.log(`API listening at http://${host}:${port}/api`, 'Bootstrap');
}

bootstrap().catch(() => {
  Logger.error('API startup failed. Check configuration and whether the port is available.', undefined, 'Bootstrap');
  process.exitCode = 1;
});
