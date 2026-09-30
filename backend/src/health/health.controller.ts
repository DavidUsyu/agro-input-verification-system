import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Public } from '../auth/auth.guards';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  live() {
    return { status: 'ok', service: 'agro-input-api' };
  }

  @Get('ready')
  async ready() {
    if (!(await this.database.isReady())) {
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'disconnected' });
    }
    return { status: 'ok', database: 'connected' };
  }
}
