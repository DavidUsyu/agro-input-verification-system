export type UserRole = 'farmer' | 'administrator';
export interface SessionUser {
  id: string; fullName: string; email: string | null; phone: string | null;
  role: UserRole; county: string | null;
}
export const SESSION_COOKIE = 'agro_session';
export function accountPath(role: UserRole) { return role === 'administrator' ? '/admin' : '/farmer'; }
