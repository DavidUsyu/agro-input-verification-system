import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { hashPassword, verifyPassword } from '../auth/passwords';
import type { SessionUser } from '../auth/auth.types';
import { pinSettings } from './validation';

@Injectable()
export class UssdAccountsService {
  constructor(private readonly database: DatabaseService) {}

  async settings(id: string) {
    return (await this.database.query(`SELECT u.phone, (c.farmer_id IS NOT NULL) AS enabled
      FROM users u LEFT JOIN ussd_credentials c ON c.farmer_id=u.id WHERE u.id=$1`, [id])).rows[0];
  }

  async save(body: unknown, id: string) {
    const input = pinSettings(body);
    const before = (await this.database.query('SELECT password_hash FROM users WHERE id=$1', [id])).rows[0];
    if (!await verifyPassword(input.password, before?.password_hash)) throw new UnauthorizedException('Current password did not match.');
    const hash = input.pin ? await hashPassword(input.pin) : null;
    try {
      await this.database.transaction(async client => {
        const user = (await client.query('SELECT password_hash,status,role FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!user || user.status !== 'active' || user.role !== 'farmer' || user.password_hash !== before.password_hash) throw new UnauthorizedException('Please sign in again.');
        if (hash) {
          await client.query('UPDATE users SET phone=$2 WHERE id=$1', [id,input.phone]);
          await client.query(`INSERT INTO ussd_credentials(farmer_id,pin_hash,version) VALUES ($1,$2,$3)
            ON CONFLICT(farmer_id) DO UPDATE SET pin_hash=$2,version=$3,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP`, [id,hash,randomBytes(32).toString('hex')]);
        } else await client.query('DELETE FROM ussd_credentials WHERE farmer_id=$1', [id]);
        // Do not wait on session locks: credentials version/hash are rechecked on each protected hop.
      });
    } catch (error) {
      if ((error as {code?: string}).code === '23505') throw new ConflictException('That phone number is already linked to an account.');
      throw error;
    }
    return this.settings(id);
  }

  async authenticate(client: PoolClient, phone: string, pin: string) {
    const row = (await client.query(`SELECT u.id,u.full_name,u.email,u.phone,u.status,c.pin_hash,c.version,c.failed_attempts,
      c.locked_until > CURRENT_TIMESTAMP AS locked FROM users u JOIN ussd_credentials c ON c.farmer_id=u.id
      WHERE u.phone=$1 AND u.role='farmer' FOR UPDATE OF c FOR SHARE OF u`, [phone])).rows[0];
    if (row?.locked) return null;
    const valid = await verifyPassword(pin, row?.pin_hash);
    if (!row || row.status !== 'active') return null;
    if (!valid) {
      await client.query(`UPDATE ussd_credentials SET failed_attempts=CASE WHEN failed_attempts>=5 THEN 1 ELSE failed_attempts+1 END,
        locked_until=CASE WHEN failed_attempts>=4 AND failed_attempts<5 THEN CURRENT_TIMESTAMP+interval '15 minutes' ELSE NULL END WHERE farmer_id=$1`, [row.id]);
      return null;
    }
    await client.query('UPDATE ussd_credentials SET failed_attempts=0,locked_until=NULL WHERE farmer_id=$1',[row.id]);
    return { id: row.id as string, version: row.version as string };
  }

  async current(client: PoolClient, id: string, version: string, phone: string): Promise<SessionUser | undefined> {
    const row = (await client.query(`SELECT u.id,u.full_name AS "fullName",u.email,u.phone,u.role,f.county
      FROM users u JOIN farmers f ON f.user_id=u.id JOIN ussd_credentials c ON c.farmer_id=u.id
      WHERE u.id=$1 AND c.version=$2 AND u.phone=$3 AND u.status='active' AND (c.locked_until IS NULL OR c.locked_until<=CURRENT_TIMESTAMP)
      FOR SHARE OF u,c`, [id,version,phone])).rows[0];
    return row as SessionUser | undefined;
  }
}
