import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      query_timeout: 3000,
    });
    this.pool.on('error', () => {
      this.logger.warn('An idle database connection was lost. Readiness checks will retry.');
    });
  }

  async isReady(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  query<Row extends QueryResultRow>(sql: string, values: unknown[] = []) {
    return this.pool.query<Row>(sql, values);
  }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
