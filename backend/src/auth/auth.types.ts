import type { IncomingMessage } from 'node:http';

export type UserRole = 'farmer' | 'administrator';
export interface SessionUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  county: string | null;
}
export interface AuthRequest extends IncomingMessage { user?: SessionUser }
export const SESSION_COOKIE = 'agro_session';

export function sessionToken(request: IncomingMessage): string | null {
  const matches = (request.headers.cookie ?? '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
