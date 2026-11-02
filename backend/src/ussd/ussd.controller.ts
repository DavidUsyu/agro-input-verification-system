import { Body, Controller, Get, Header, HttpCode, HttpException, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthRequest } from '../auth/auth.types';
import { AuthMutationGuard, Public, RequireRole } from '../auth/auth.guards';
import { UssdService } from './ussd.service';
import { UssdAccountsService } from './ussd-accounts.service';
import { callbackInput } from './validation';
import { ProductMutationGuard } from '../products/products.controller';

@Controller('ussd')
export class UssdController {
  private readonly attempts = new Map<string,{count:number;reset:number}>();
  constructor(private readonly service: UssdService, private readonly accounts: UssdAccountsService, private readonly config: ConfigService) {}

  @Get('settings')
  @RequireRole('farmer')
  @Header('Cache-Control','no-store')
  settings(@Req() request: AuthRequest) { return this.accounts.settings(request.user!.id); }

  @Post('settings')
  @RequireRole('farmer')
  @UseGuards(AuthMutationGuard)
  @HttpCode(200)
  @Header('Cache-Control','no-store')
  save(@Body() body: unknown, @Req() request: AuthRequest) { return this.accounts.save(body,request.user!.id); }

  @Post('simulate')
  @RequireRole('administrator')
  @UseGuards(ProductMutationGuard)
  @HttpCode(200)
  @Header('Cache-Control','no-store')
  async simulate(@Body() body: unknown) {
    return { response: await this.run(body) };
  }

  @Public()
  @Post('callback/:token')
  @HttpCode(200)
  @Header('Content-Type','text/plain; charset=utf-8')
  @Header('Cache-Control','no-store')
  async callback(@Param('token') token: string, @Body() body: unknown, @Req() request: AuthRequest) {
    const expected = this.config.get<string>('USSD_CALLBACK_TOKEN');
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!expected || !timingSafeEqual(digest(token),digest(expected))) throw new NotFoundException();
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') return 'END Unsupported request format.';
    try {
      const input = callbackInput(body);
      if (input.serviceCode !== this.config.get<string>('USSD_SERVICE_CODE')) return 'END Service unavailable.';
      return await this.run(body);
    } catch { return 'END Invalid input. Dial again.'; }
  }

  private async run(body: unknown) {
    try {
      const input = callbackInput(body);
      const now=Date.now();
      for (const [key,bucket] of this.attempts) if (bucket.reset<=now) this.attempts.delete(key);
      const key=createHash('sha256').update(input.phone).digest('hex');
      const bucket=this.attempts.get(key) ?? {count:0,reset:now+15*60*1000};
      if (bucket.count>=200 || (!this.attempts.has(key) && this.attempts.size>=10000)) return 'END Too many requests. Please try later.';
      bucket.count++; this.attempts.set(key,bucket);
      return await this.service.callback(body);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus()===400) return 'END Invalid input. Dial again.';
      return 'END Service temporarily unavailable. Please try again.';
    }
  }
}
