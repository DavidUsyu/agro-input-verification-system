import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { accountPath, SESSION_COOKIE } from './auth-types';
import type { SessionUser, UserRole } from './auth-types';

export function backendUrl() {
  return (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001/api').replace(/\/$/, '');
}

export const sessionState = cache(async (): Promise<{ user: SessionUser | null; unavailable: boolean }> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return { user: null, unavailable: false };
  try {
    const response = await fetch(`${backendUrl()}/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return { user: null, unavailable: false };
    if (!response.ok) return { user: null, unavailable: true };
    return { user: (await response.json()).user, unavailable: false };
  } catch {
    return { user: null, unavailable: true };
  }
});

export async function currentUser(): Promise<SessionUser | null> {
  const { user, unavailable } = await sessionState();
  // Protected pages must still require a successful session check.
  if (unavailable) throw new Error('The sign-in service is unavailable. Please try again.');
  return user;
}

export async function requireUser(role: UserRole): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== role) redirect(accountPath(user.role));
  return user;
}
