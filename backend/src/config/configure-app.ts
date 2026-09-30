import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  app.useBodyParser('json', { limit: '8kb' });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.getOrThrow<string>('FRONTEND_ORIGIN'), credentials: true });
  app.enableShutdownHooks();
}
