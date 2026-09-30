'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Sign out failed. Please try again.');
      router.replace('/login');
      router.refresh();
    } catch { setError('Could not sign out. Please try again.'); setBusy(false); }
  }
  return <div><button className="button button-secondary" disabled={busy} onClick={logout}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="form-error">{error}</p>}</div>;
}
