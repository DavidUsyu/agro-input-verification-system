import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Header, Injectable, Param, Post, Put, Query, Req, UnsupportedMediaTypeException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequireRole } from '../auth/auth.guards';
import type { AuthRequest } from '../auth/auth.types';
import { ProductsService } from './products.service';

@Injectable()
export class ProductMutationGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.method === 'GET' || request.method === 'HEAD') return true;
    if (request.headers.origin !== this.config.getOrThrow<string>('FRONTEND_ORIGIN')) throw new ForbiddenException('The request must come from the application.');
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new UnsupportedMediaTypeException('Use application/json.');
    return true;
  }
}

@Controller('products')
@RequireRole('administrator')
@UseGuards(ProductMutationGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown) { return this.products.list(query); }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown, @Req() request: AuthRequest) { return this.products.create(body, request.user!.id); }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Param('id') id: string) { return this.products.get(id); }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown) { return this.products.update(id, body); }

  @Get(':id/codes')
  @Header('Cache-Control', 'no-store')
  codes(@Param('id') id: string, @Query() query: unknown) { return this.products.codes(id, query); }

  @Post(':id/codes')
  @Header('Cache-Control', 'no-store')
  createCode(@Param('id') id: string, @Body() body: unknown) { return this.products.createCode(id, body); }

  @Post(':id/codes/bulk')
  @Header('Cache-Control', 'no-store')
  createCodeBatch(@Param('id') id: string, @Body() body: unknown) { return this.products.createCodeBatch(id, body); }

  @Put(':id/codes/:codeId')
  @Header('Cache-Control', 'no-store')
  updateCode(@Param('id') id: string, @Param('codeId') codeId: string, @Body() body: unknown) { return this.products.updateCode(id, codeId, body); }
}
