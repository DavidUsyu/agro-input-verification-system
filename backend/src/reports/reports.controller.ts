import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Header, HttpException, Injectable, Param, Post, Put, Query, Req, UnsupportedMediaTypeException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequireRole } from '../auth/auth.guards';
import type { AuthRequest } from '../auth/auth.types';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportMutationGuard implements CanActivate {
  private readonly attempts = new Map<string,{count:number;reset:number}>();
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.method === 'GET') return true;
    if (request.headers.origin !== this.config.getOrThrow<string>('FRONTEND_ORIGIN')) throw new ForbiddenException('The request must come from the application.');
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new UnsupportedMediaTypeException('Use application/json.');
    if (request.method === 'POST') {
      const now = Date.now();
      for (const [key,bucket] of this.attempts) if (bucket.reset<=now) this.attempts.delete(key);
      const key = request.user!.id;
      const bucket = this.attempts.get(key) ?? { count:0,reset:now+15*60*1000 };
      if (bucket.count>=20 || (!this.attempts.has(key) && this.attempts.size>=10000)) {
        context.switchToHttp().getResponse<{setHeader:(name:string,value:string)=>void}>().setHeader('Retry-After',String(Math.ceil((bucket.reset-now)/1000)));
        throw new HttpException('Too many reports. Please try again later.',429);
      }
      bucket.count++; this.attempts.set(key,bucket);
    }
    return true;
  }
}

@Controller('reports')
@UseGuards(ReportMutationGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('catalogue')
  @RequireRole('farmer')
  @Header('Cache-Control','no-store')
  catalogue(@Query() query: unknown) { return this.reports.catalogue(query); }
  @Post()
  @RequireRole('farmer')
  @Header('Cache-Control','no-store')
  create(@Body() body: unknown,@Req() request: AuthRequest) { return this.reports.create(body,request.user!.id); }
  @Get('mine')
  @RequireRole('farmer')
  @Header('Cache-Control','no-store')
  mine(@Query() query: unknown,@Req() request: AuthRequest) { return this.reports.list(query,request.user!.id,false); }
  @Get()
  @RequireRole('administrator')
  @Header('Cache-Control','no-store')
  list(@Query() query: unknown) { return this.reports.list(query,null,true); }
  @Get(':id')
  @Header('Cache-Control','no-store')
  get(@Param('id') id: string,@Req() request: AuthRequest) { return this.reports.get(id,request.user!.role==='farmer' ? request.user!.id : null,request.user!.role==='administrator'); }
  @Put(':id/review')
  @RequireRole('administrator')
  @Header('Cache-Control','no-store')
  review(@Param('id') id: string,@Body() body: unknown,@Req() request: AuthRequest) { return this.reports.review(id,body,request.user!.id); }
}
