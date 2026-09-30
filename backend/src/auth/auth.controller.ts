import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServerResponse } from 'node:http';
import { AuthService } from './auth.service';
import { AuthMutationGuard, Public, RequireRole } from './auth.guards';
import { SESSION_COOKIE, sessionToken } from './auth.types';
import type { AuthRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  private cookie(response: ServerResponse, token: string, lifetime: number) {
    const secure = this.config.getOrThrow<boolean>('SESSION_COOKIE_SECURE') ? '; Secure' : '';
    response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetime}${secure}`);
    response.setHeader('Cache-Control', 'no-store');
  }

  @Public()
  @Post('register')
  @UseGuards(AuthMutationGuard)
  @Header('Cache-Control', 'no-store')
  async register(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse) {
    const result = await this.auth.register(body, sessionToken(request));
    this.cookie(response, result.token, result.lifetime);
    return { user: result.user };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(AuthMutationGuard)
  @Header('Cache-Control', 'no-store')
  async login(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse) {
    const result = await this.auth.login(body, sessionToken(request));
    this.cookie(response, result.token, result.lifetime);
    return { user: result.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthMutationGuard)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse) {
    await this.auth.logout(sessionToken(request));
    this.cookie(response, '', 0);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() request: AuthRequest) { return { user: request.user }; }

  @Get('farmer')
  @RequireRole('farmer')
  @Header('Cache-Control', 'no-store')
  farmer(@Req() request: AuthRequest) { return { user: request.user }; }

  @Get('administrator')
  @RequireRole('administrator')
  @Header('Cache-Control', 'no-store')
  administrator(@Req() request: AuthRequest) { return { user: request.user }; }
}
