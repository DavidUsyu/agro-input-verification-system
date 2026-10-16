'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { UserRole } from '@/lib/auth-types';
import type { VerificationRecord } from '@/lib/verification-types';
import { resultLabels } from '@/lib/verification-types';
import { VerificationDetails } from './verification-result';

export function VerificationForm({ role }: { role?: UserRole }) {
  const router = useRouter();
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessionEnded, setSessionEnded] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => { if (record) resultRef.current?.focus(); }, [record]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setRecord(null); setError(''); setSessionEnded(false); setBusy(true);
    try {
      const response = await fetch('/api/verifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.message === 'string' ? result.message : 'Unable to verify this code. Please try again.');
        setSessionEnded(response.status === 401); return;
      }
      setRecord(result);
    } catch { setError('Unable to connect to verification. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  async function continueAsGuest() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      setSessionEnded(false); setError('You are signed out. Submit the code again to check as a guest.');
      router.refresh();
    } catch { setError('Unable to sign out. Please try again shortly.'); }
    finally { setBusy(false); }
  }
  return <>
    <section className="account-card verify-input" aria-labelledby="check-heading">
      <p className="eyebrow">From package to record</p><h2 id="check-heading">Enter the product code</h2>
      <p>Find the code printed on your seed or fertilizer packaging.</p>
      <form onSubmit={submit} aria-busy={busy} aria-label="Verify product code">
        <label className="field">Product code<input name="code" className="code-input" value={code} onChange={(event) => { setCode(event.target.value); setRecord(null); }} required maxLength={80} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="verification-hint" /></label>
        <p id="verification-hint" className="field-hint">Enter up to 80 characters. Letter case does not matter.</p>
        <button className="button" disabled={busy}>{busy ? 'Checking…' : 'Verify code'}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {sessionEnded && <div className="action-row"><Link className="button" href="/login">Sign in again</Link><button className="button button-secondary" disabled={busy} onClick={continueAsGuest}>Continue as guest</button></div>}
      <p className="field-hint">{role === 'farmer' ? 'Your checks are saved in your personal verification history.' : role === 'administrator' ? 'Administrator checks appear in the all-records view.' : <>You can check without an account. <Link href="/login">Sign in</Link> to save future checks in your personal history.</>}</p>
    </section>
    {record && <section ref={resultRef} tabIndex={-1} className={`account-card verification-result result-panel-${record.result}`} aria-labelledby="result-heading" aria-live="polite">
      <p className="eyebrow">Verification result</p><h2 id="result-heading">{resultLabels[record.result]}</h2>
      <p className="submitted-code">Submitted code: <strong>{record.enteredCode || '(empty)'}</strong></p>
      <VerificationDetails record={record} />
      {record.savedToAccount && <Link className="button button-secondary" href="/farmer/history">View my history</Link>}
      {role === 'administrator' && <Link className="button button-secondary" href="/admin/verifications">View all records</Link>}
    </section>}
  </>;
}
