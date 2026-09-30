'use client';

import { useEffect } from 'react';
import { accountPath } from '@/lib/auth-types';

export function SessionWatch() {
  useEffect(() => {
    async function check() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
        if (response.status === 401) { window.location.replace('/login'); return; }
        if (response.ok) {
          const { user } = await response.json();
          if (window.location.pathname !== accountPath(user.role)) window.location.replace(accountPath(user.role));
        }
      } catch { /* An interrupted connection does not sign the user out. */ }
    }
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, 60000);
    return () => { window.removeEventListener('pageshow', check); document.removeEventListener('visibilitychange', check); window.clearInterval(timer); };
  }, []);
  return null;
}
