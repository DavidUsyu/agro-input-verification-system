import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health/health.controller';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthMutationGuard, SessionGuard } from './auth/auth.guards';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment })],
  controllers: [HealthController, AuthController],
  providers: [DatabaseService, AuthService, AuthMutationGuard, { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
