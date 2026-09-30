import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { sessionState } from '@/lib/session';
import { accountPath } from '@/lib/auth-types';

export default async function RegisterPage() {
  const { user, unavailable } = await sessionState();
  if (user) redirect(accountPath(user.role));
  return <main id="main" className="auth-page"><AuthForm mode="register" serviceUnavailable={unavailable} /></main>;
}
