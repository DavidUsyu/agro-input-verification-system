import { Controller, Get, Header, Query } from '@nestjs/common';
import { RequireRole } from '../auth/auth.guards';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@RequireRole('administrator')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get()
  @Header('Cache-Control','no-store')
  overview(@Query() query: unknown) { return this.dashboard.overview(query); }
}
