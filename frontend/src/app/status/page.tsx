'use client';

import { useState } from 'react';

type Connection = 'Not checked' | 'Checking…' | 'Connected' | 'Unavailable';
const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');

export default function StatusPage() {
  const [api, setApi] = useState<Connection>('Not checked');
  const [database, setDatabase] = useState<Connection>('Not checked');
  const [checking, setChecking] = useState(false);

  async function checkConnection() {
    setChecking(true);
    setApi('Checking…');
    setDatabase('Checking…');
    try {
      const [live, ready] = await Promise.allSettled([
        fetch(`${apiUrl}/health`, { cache: 'no-store', signal: AbortSignal.timeout(7000) }),
        fetch(`${apiUrl}/health/ready`, { cache: 'no-store', signal: AbortSignal.timeout(7000) }),
      ]);
      setApi(live.status === 'fulfilled' && live.value.ok ? 'Connected' : 'Unavailable');
      setDatabase(ready.status === 'fulfilled' && ready.value.ok ? 'Connected' : 'Unavailable');
    } finally {
      setChecking(false);
    }
  }

  return (
    <main id="main" className="status-page">
      <p className="eyebrow">Development tools</p>
      <h1>Service status</h1>
      <p>Check that this browser can reach the API and that the API can connect to PostgreSQL.</p>
      <dl className="service-list" aria-live="polite" aria-busy={checking}>
        <div><dt>Web application</dt><dd>Running</dd></div>
        <div><dt>Backend API</dt><dd>{api}</dd></div>
        <div><dt>PostgreSQL database</dt><dd>{database}</dd></div>
      </dl>
      <button className="button" disabled={checking} onClick={checkConnection}>{checking ? 'Checking…' : 'Check connection'}</button>
      {(api === 'Unavailable' || database === 'Unavailable') && <p className="status-help">Check the local setup instructions in the README. Both application servers and the database must be running; the configured browser origin must also match.</p>}
    </main>
  );
}
