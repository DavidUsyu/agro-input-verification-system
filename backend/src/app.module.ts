import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health/health.controller';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthMutationGuard, SessionGuard } from './auth/auth.guards';
import { ProductsController, ProductMutationGuard } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { VerificationController, VerificationGuard } from './verification/verification.controller';
import { VerificationService } from './verification/verification.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment })],
  controllers: [HealthController, AuthController, ProductsController, VerificationController],
  providers: [DatabaseService, AuthService, AuthMutationGuard, ProductsService, ProductMutationGuard, VerificationService, VerificationGuard, { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
