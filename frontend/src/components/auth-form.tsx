'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { accountPath } from '@/lib/auth-types';

export function AuthForm({ mode, serviceUnavailable = false }: { mode: 'login' | 'register'; serviceUnavailable?: boolean }) {
  const register = mode === 'register';
  const router = useRouter();
  const [error, setError] = useState(serviceUnavailable ? 'We could not check your existing session. The sign-in service is temporarily unavailable. Please try again shortly.' : '');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    setError('');
    if (register && password !== data.get('confirmPassword')) { setError('The passwords do not match.'); return; }
    if (register && !String(data.get('email') ?? '').trim() && !String(data.get('phone') ?? '').trim()) {
      setError('Provide an email address or a phone number.'); return;
    }
    const body = register ? {
      fullName: data.get('fullName'), email: data.get('email'), phone: data.get('phone'), county: data.get('county'), password,
    } : { identifier: data.get('identifier'), password };
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) { setError(typeof result.message === 'string' ? result.message : 'Please check your details and try again.'); return; }
      router.replace(accountPath(result.user.role));
      router.refresh();
    } catch { setError('Unable to connect. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-card">
      <p className="eyebrow">{register ? 'Your farmer account' : 'Welcome back'}</p>
      <h1>{register ? 'Create your account' : 'Sign in to AgroVerify'}</h1>
      <p className="auth-intro">{register ? 'Keep your account ready for product checks and your personal verification history.' : 'Farmers and administrators use the same sign-in page.'}</p>
      <form onSubmit={submit} aria-busy={busy}>
        {register ? <>
          <label className="field">Full name<input name="fullName" autoComplete="name" required maxLength={120} /></label>
          <p className="field-hint" id="contact-hint">Provide at least one: an email address or a phone number.</p>
          <div className="field-grid">
            <label className="field">Email address<input name="email" type="email" autoComplete="email" maxLength={160} aria-describedby="contact-hint" /></label>
            <label className="field">Phone number<input name="phone" type="tel" autoComplete="tel" placeholder="0712345678" maxLength={30} aria-describedby="contact-hint" /></label>
          </div>
          <label className="field">County <span className="optional">(optional)</span><input name="county" autoComplete="address-level1" maxLength={80} /></label>
        </> : <label className="field">Email address or phone number<input name="identifier" autoComplete="username" required maxLength={160} /></label>}
        <label className="field">Password<input name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 15 : 1} maxLength={128} aria-describedby={register ? 'password-hint' : undefined} /></label>
        {register && <>
          <p className="field-hint" id="password-hint">Use 15 to 128 characters. A memorable phrase works well.</p>
          <label className="field">Confirm password<input name="confirmPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={15} maxLength={128} /></label>
        </>}
        <label className="show-password"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Show {register ? 'passwords' : 'password'}</label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button auth-submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create farmer account' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">{register ? 'Already have an account? ' : 'New to AgroVerify? '}<Link href={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create a farmer account'}</Link></p>
    </div>
  );
}
