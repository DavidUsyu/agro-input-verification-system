import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, SetMetadata, UnauthorizedException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { sessionToken } from './auth.types';
import type { AuthRequest, UserRole } from './auth.types';
import type { ServerResponse } from 'node:http';

const PUBLIC = 'agro:public';
const ROLE = 'agro:role';
export const Public = () => SetMetadata(PUBLIC, true);
export const RequireRole = (role: UserRole) => SetMetadata(ROLE, role);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = await this.auth.currentUser(sessionToken(request));
    if (!user) throw new UnauthorizedException('Please sign in to continue.');
    const role = this.reflector.getAllAndOverride<UserRole>(ROLE, [context.getHandler(), context.getClass()]);
    if (role && user.role !== role) throw new ForbiddenException('This account cannot access that area.');
    request.user = user;
    return true;
  }
}

@Injectable()
export class AuthMutationGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; reset: number }>();
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.headers.origin !== this.config.getOrThrow<string>('FRONTEND_ORIGIN')) {
      throw new ForbiddenException('The request must come from the application.');
    }
    const action = context.getHandler().name;
    if (action === 'logout') return true;
    const now = Date.now();
    for (const [key, bucket] of this.attempts) if (bucket.reset <= now) this.attempts.delete(key);
    // Do not trust client-supplied forwarding headers. Behind the Next.js proxy,
    // this limit applies to the proxy peer; distributed deployment needs a shared limiter.
    const key = `${action}:${request.socket.remoteAddress ?? 'unknown'}`;
    const bucket = this.attempts.get(key) ?? { count: 0, reset: now + 15 * 60 * 1000 };
    const limit = action === 'register' ? 10 : 20;
    if (bucket.count >= limit || (!this.attempts.has(key) && this.attempts.size >= 10000)) {
      context.switchToHttp().getResponse<ServerResponse>().setHeader('Retry-After', String(Math.ceil((bucket.reset - now) / 1000)));
      throw new HttpException('Too many attempts. Please try again later.', 429);
    }
    bucket.count++;
    this.attempts.set(key, bucket);
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new UnsupportedMediaTypeException('Use application/json.');
    return true;
  }
}
