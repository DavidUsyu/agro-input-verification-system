'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function UssdSettings() {
  const router=useRouter();
  const [settings,setSettings]=useState<{enabled:boolean;phone:string|null}|null>(null);
  const [phone,setPhone]=useState(''); const [password,setPassword]=useState('');
  const [pin,setPin]=useState(''); const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  useEffect(()=>{const controller=new AbortController();fetch('/api/ussd/settings',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Unable to load USSD settings. Refresh to try again.');const result=await response.json();setSettings(result);setPhone(result.phone ?? '');}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});return ()=>controller.abort();},[]);
  async function save(disable=false) {
    setError('');setMessage('');
    if(!disable && pin!==confirm){setError('The PINs do not match.');return;}
    setBusy(true);
    try {
      const response=await fetch('/api/ussd/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,pin:disable?null:pin,...(!disable?{phone}:{})}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(response.status===401){setPassword('');throw new Error(result.message ?? 'Please sign in again.');}
      if(!response.ok)throw new Error(typeof result.message==='string'?result.message:'Unable to update USSD access.');
      setSettings(result);setPassword('');setPin('');setConfirm('');setMessage(disable?'USSD account access disabled.':'USSD PIN saved. Use this phone number and PIN for account menus.');router.refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save. Please try again.');}finally{setBusy(false);}
  }
  return <section className="account-card" aria-labelledby="ussd-settings-heading"><h2 id="ussd-settings-heading">USSD account access</h2>
    <p>Use a separate six-digit PIN for personal history and product reports through USSD. Your website password stays the same.</p>
    <p className="field-hint">A live dialling code has not been connected yet. You can test the flow with the administrator’s simulator. Phone ownership is not verified by SMS in this version.</p>
    {settings && <p>Status: <strong>{settings.enabled?'Enabled':'Not enabled'}</strong></p>}
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    {settings && <form onSubmit={event=>{event.preventDefault();void save();}} className="ussd-settings-form">
      <label className="field">Kenyan phone number<input type="tel" name="ussdPhone" autoComplete="tel" required maxLength={30} value={phone} onChange={event=>setPhone(event.target.value)} disabled={busy}/></label>
      <label className="field">Current website password<input type="password" name="currentPassword" autoComplete="current-password" required maxLength={256} value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label>
      <label className="field">New USSD PIN<input type="password" name="ussdPin" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{6}" minLength={6} maxLength={6} value={pin} onChange={event=>setPin(event.target.value)} disabled={busy}/></label>
      <label className="field">Confirm USSD PIN<input type="password" name="confirmUssdPin" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{6}" maxLength={6} value={confirm} onChange={event=>setConfirm(event.target.value)} disabled={busy}/></label>
      <p className="field-hint">Avoid repeated digits and simple sequences. Saving a new PIN ends existing USSD account sessions.</p>
      <div className="action-row"><button className="button" disabled={busy} type="submit">{busy?'Saving…':'Save USSD PIN'}</button>{settings.enabled && <button className="button button-secondary" type="button" disabled={busy||!password} onClick={()=>void save(true)}>Disable USSD account access</button>}</div>
    </form>}
  </section>;
}
