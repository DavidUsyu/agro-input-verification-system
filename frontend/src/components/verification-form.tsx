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
  const [locationNote, setLocationNote] = useState('');
  const [locating, setLocating] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { requestVersion.current++; activeRequest.current?.abort(); }, []);
  useEffect(() => { if (record) resultRef.current?.focus(); }, [record]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const version = ++requestVersion.current;
    setRecord(null); setError(''); setSessionEnded(false); setBusy(true);
    try {
      setLocationNote('');
      let location: { latitude: number; longitude: number; accuracy: number; timestamp: number } | null = null;
      if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(code.trim())) {
        setLocating(true);
        location = await new Promise((resolve) => {
          if (!navigator.geolocation) { resolve(null); return; }
          const timeout = window.setTimeout(() => resolve(null), 15000);
          try {
            navigator.geolocation.getCurrentPosition((position) => {
              window.clearTimeout(timeout);
              resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp });
            }, () => { window.clearTimeout(timeout); resolve(null); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
          } catch { window.clearTimeout(timeout); resolve(null); }
        });
        if (version !== requestVersion.current) return;
        setLocating(false);
        if (!location) setLocationNote('Current location was unavailable for this check. You can allow location access in your browser and try again.');
      }
      const controller = new AbortController(); activeRequest.current = controller;
      const response = await fetch('/api/verifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ code, location }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.message === 'string' ? result.message : 'Unable to verify this code. Please try again.');
        setSessionEnded(response.status === 401); return;
      }
      setRecord(result);
    } catch { if (version === requestVersion.current) setError('Unable to connect to verification. Check your connection and try again.'); }
    finally { if (version === requestVersion.current) { setLocating(false); setBusy(false); } }
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
        <label className="field">Product code<input name="code" className="code-input" value={code} onChange={(event) => { setCode(event.target.value); setRecord(null); }} disabled={busy} required maxLength={80} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="verification-hint" /></label>
        <p id="verification-hint" className="field-hint">Enter up to 80 characters. Letter case does not matter.</p>
        <p className="field-hint">With your permission, we use your current location to support this verification. Precise coordinates are not stored.</p>
        <button className="button" disabled={busy}>{locating ? 'Getting current location…' : busy ? 'Checking…' : 'Verify code'}</button>
      </form>
      {locationNote && <p className="field-hint" role="status">{locationNote}</p>}
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
      {role === 'farmer' && <p><Link className="button button-secondary" href={`/farmer/reports/new?${new URLSearchParams({code:record.enteredCode,...(record.savedToAccount ? {verificationId:record.id} : {})})}`}>Report a concern</Link></p>}
      {!role && <p className="field-hint"><Link href="/login">Sign in as a farmer</Link> to report a product concern.</p>}
    </section>}
  </>;
}
