'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { UserRole } from '@/lib/auth-types';
import type { VerificationRecord } from '@/lib/verification-types';
import { productReportHref, resultLabels } from '@/lib/verification-types';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
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
    <div className="verification-entry-layout"><section className="account-card verify-input" aria-labelledby="check-heading">
      <p className="eyebrow">One package, one check</p><h2 id="check-heading">Enter the product code</h2>
      <p>Find the unique code printed on your seed or fertilizer package.</p>
      <form ref={formRef} onSubmit={submit} aria-busy={busy} aria-label="Verify product code">
        <label className="field">Product code<input ref={inputRef} name="code" className="code-input" value={code} onChange={(event) => { setCode(event.target.value); setRecord(null); setLocationNote(''); setError(''); }} disabled={busy} required maxLength={80} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="verification-hint location-hint" placeholder="Type the code from the package" /></label>
        <p id="verification-hint" className="field-hint">Include any hyphens. Capital and small letters both work.</p>
        <p id="location-hint" className="verification-location-note">Your browser will ask for your current location to support this check. Allow access when prompted. Precise coordinates are not stored.</p>
        <button className="button" disabled={busy}>{locating ? 'Getting current location…' : busy ? 'Checking…' : 'Verify code'}</button>
      </form>
      {locationNote && <div className="location-retry" role="status"><p>{locationNote}</p><button className="text-button" type="button" disabled={busy || sessionEnded} onClick={()=>formRef.current?.requestSubmit()}>Retry with location</button></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {sessionEnded && <div className="action-row"><Link className="button" href="/login">Sign in again</Link><button className="button button-secondary" disabled={busy} onClick={continueAsGuest}>Continue as guest</button></div>}
      <p className="field-hint">{role === 'farmer' ? 'Your checks are saved in your personal verification history.' : role === 'administrator' ? 'Administrator checks appear in the all-records view.' : <>You can check without an account. <Link href="/login">Sign in</Link> to save future checks in your personal history.</>}</p>
    </section><aside className="verification-help" aria-labelledby="verification-help-heading"><h2 id="verification-help-heading">What will I see?</h2><ol><li><strong>A clear result</strong><span>Whether the code matches a record or needs attention.</span></li><li><strong>Product details</strong><span>Available product, batch and expiry information to compare with your package.</span></li><li><strong>Your next step</strong><span>Guidance on checking the label or reporting a concern.</span></li></ol><p>A code that is not found does not by itself prove that a product is counterfeit.</p></aside></div>
    {record && <section ref={resultRef} tabIndex={-1} className={`account-card verification-result result-panel-${record.result}`} aria-labelledby="result-heading" aria-live="polite">
      <div className="result-heading-row"><span className={`result-symbol result-${record.result}`} aria-hidden="true">{record.result==='verified'?'✓':'!'}</span><div><p className="eyebrow">Verification result</p><h2 id="result-heading">{resultLabels[record.result]}</h2></div></div>
      <p className="submitted-code">Submitted code: <strong>{record.enteredCode || '(empty)'}</strong></p>
      <VerificationDetails record={record} />
      <div className="action-row result-actions"><button className="button" type="button" onClick={()=>{setCode('');setRecord(null);setLocationNote('');setError('');inputRef.current?.focus();}}>Verify another product</button>
      {role === 'farmer' && <Link className="button button-secondary" href={productReportHref(record,!!record.savedToAccount)}>Report this product</Link>}
      {record.savedToAccount && <Link className="result-history-link" href="/farmer/history">View my history</Link>}
      {role === 'administrator' && <Link className="button button-secondary" href="/admin/verifications">View all records</Link>}</div>
      {!role && <p className="field-hint"><Link href="/login">Sign in as a farmer</Link> to report a product concern.</p>}
    </section>}
  </>;
}
