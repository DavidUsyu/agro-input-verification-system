import { Body, CanActivate, Controller, ExecutionContext, Get, Header, HttpException, Injectable, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { AuthService } from '../auth/auth.service';
import { Public, RequireRole } from '../auth/auth.guards';
import { SESSION_COOKIE, sessionToken } from '../auth/auth.types';
import type { AuthRequest } from '../auth/auth.types';
import { ProductMutationGuard } from '../products/products.controller';
import { VerificationService } from './verification.service';

@Injectable()
export class VerificationGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; reset: number }>();
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const hasCookie = (request.headers.cookie ?? '').split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
    if (hasCookie) {
      const user = await this.auth.currentUser(sessionToken(request));
      if (!user) throw new UnauthorizedException('Your session has ended. Sign in again or sign out to check as a guest.');
      request.user = user;
    }
    const now = Date.now();
    for (const [key, bucket] of this.attempts) if (bucket.reset <= now) this.attempts.delete(key);
    const key = request.user ? `user:${request.user.id}` : `peer:${request.socket.remoteAddress ?? 'unknown'}`;
    const bucket = this.attempts.get(key) ?? { count: 0, reset: now + 60000 };
    if (bucket.count >= 60 || (!this.attempts.has(key) && this.attempts.size >= 10000)) {
      context.switchToHttp().getResponse<ServerResponse>().setHeader('Retry-After', String(Math.ceil((bucket.reset - now) / 1000)));
      throw new HttpException('Too many checks. Please wait a minute and try again.', 429);
    }
    bucket.count++; this.attempts.set(key, bucket);
    return true;
  }
}

@Controller('verifications')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Public()
  @Post()
  @UseGuards(ProductMutationGuard, VerificationGuard)
  @Header('Cache-Control', 'no-store')
  verify(@Body() body: unknown, @Req() request: AuthRequest) { return this.verification.verify(body, request.user); }

  @Get('mine')
  @RequireRole('farmer')
  @Header('Cache-Control', 'no-store')
  mine(@Query() query: unknown, @Req() request: AuthRequest) { return this.verification.history(query, request.user!, false); }

  @Get()
  @RequireRole('administrator')
  @Header('Cache-Control', 'no-store')
  all(@Query() query: unknown, @Req() request: AuthRequest) { return this.verification.history(query, request.user!, true); }
}
