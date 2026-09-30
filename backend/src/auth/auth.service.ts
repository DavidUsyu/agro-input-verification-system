import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { hashPassword, verifyPassword } from './passwords';
import { parseLogin, parseRegistration } from './validation';
import type { SessionUser, UserRole } from './auth.types';

interface UserRow {
  id: string; full_name: string; email: string | null; phone: string | null;
  role: UserRole; status: string; password_hash: string; county: string | null;
}
const selectUser = `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.password_hash,
  f.county FROM users u LEFT JOIN farmers f ON f.user_id = u.id`;
export function tokenDigest(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function publicUser(row: UserRow): SessionUser {
  return { id: row.id, fullName: row.full_name, email: row.email, phone: row.phone, role: row.role, county: row.county };
}

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService, private readonly config: ConfigService) {}

  private async issueSession(client: PoolClient, userId: string, previous: string | null) {
    const token = randomBytes(32).toString('hex');
    const lifetime = this.config.getOrThrow<number>('SESSION_TTL_HOURS') * 3600;
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1 AND expires_at <= CURRENT_TIMESTAMP', [userId]);
    if (previous) await client.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenDigest(previous)]);
    await client.query("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + $3 * interval '1 second')", [tokenDigest(token), userId, lifetime]);
    return { token, lifetime };
  }

  async register(body: unknown, previous: string | null) {
    const data = parseRegistration(body);
    const passwordHash = await hashPassword(data.password);
    try {
      return await this.database.transaction(async (client) => {
        const row = (await client.query<{ id: string }>(
          "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, 'farmer') RETURNING id",
          [data.fullName, data.email, data.phone, passwordHash],
        )).rows[0];
        await client.query('INSERT INTO farmers (user_id, county) VALUES ($1, $2)', [row.id, data.county]);
        const user = publicUser((await client.query<UserRow>(`${selectUser} WHERE u.id = $1`, [row.id])).rows[0]);
        return { user, ...await this.issueSession(client, row.id, previous) };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Unable to create an account with those details. Try signing in or use different contact details.');
      throw error;
    }
  }

  async login(body: unknown, previous: string | null) {
    const data = parseLogin(body);
    const query = data.identifier.includes('@') ? 'lower(u.email) = $1' : 'u.phone = $1';
    const row = (await this.database.query<UserRow>(`${selectUser} WHERE ${query}`, [data.identifier])).rows[0];
    const valid = await verifyPassword(data.password, row?.password_hash);
    if (!row || !valid || row.status !== 'active') throw new UnauthorizedException('Email or phone and password did not match an active account.');
    return this.database.transaction(async (client) => {
      // Recheck under a row lock before issuing the session if account state changed during hashing.
      const current = (await client.query<UserRow>(`${selectUser} WHERE u.id = $1 FOR UPDATE OF u`, [row.id])).rows[0];
      if (!current || current.status !== 'active' || current.password_hash !== row.password_hash) throw new UnauthorizedException('Email or phone and password did not match an active account.');
      return { user: publicUser(current), ...await this.issueSession(client, current.id, previous) };
    });
  }

  async currentUser(token: string | null): Promise<SessionUser | null> {
    if (!token) return null;
    const result = await this.database.query<UserRow>(`${selectUser}
      JOIN auth_sessions s ON s.user_id = u.id
      WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.status = 'active'`, [tokenDigest(token)]);
    return result.rows[0] ? publicUser(result.rows[0]) : null;
  }

  async logout(token: string | null): Promise<void> {
    if (token) await this.database.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenDigest(token)]);
  }
}
