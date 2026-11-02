'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function UssdSimulator() {
  const router=useRouter();
  const [phone,setPhone]=useState(''); const [answer,setAnswer]=useState('');
  const [screen,setScreen]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const session=useRef<{id:string;text:string}|null>(null);
  const continuing=screen.startsWith('CON ');
  const pinScreen=screen.includes('Enter your 6-digit USSD PIN');
  async function send(start=false,value=answer) {
    setBusy(true);setError('');
    if(start)session.current={id:crypto.randomUUID(),text:''};
    const current=session.current!;
    const nextText=start?'':current.text ? `${current.text}*${value}` : value;
    try{
      const response=await fetch('/api/ussd/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:current.id,serviceCode:'*384*00000#',phoneNumber:phone,text:nextText}),signal:AbortSignal.timeout(15000)});
      if(response.status===401){router.replace('/login');router.refresh();throw new Error('Please sign in again.');}
      const result=await response.json();if(!response.ok)throw new Error(typeof result.message==='string'?result.message:'Unable to run the session.');
      current.text=nextText;setScreen(result.response);setAnswer('');
      if(result.response.startsWith('END '))session.current=null;
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to connect. Try again.');}finally{setBusy(false);}
  }
  return <section className="account-card ussd-simulator"><h2>Try the USSD menus</h2><p>This local simulator uses the same menus as the provider callback. Checks and submitted reports are saved to this system’s database.</p>
    <form aria-label="Start USSD session" onSubmit={event=>{event.preventDefault();void send(true);}}><label className="field">Farmer’s Kenyan phone number<input name="simulatorPhone" type="tel" required maxLength={30} value={phone} disabled={busy||continuing} onChange={event=>setPhone(event.target.value)} autoComplete="off"/></label><div className="action-row"><button className="button" type="submit" disabled={busy||continuing}>Start session</button>{continuing && <button type="button" className="button button-secondary" disabled={busy} onClick={()=>void send(false,'0')}>End session</button>}</div></form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {screen && <div className="ussd-screen" role="status" aria-live="polite"><pre>{screen.slice(4)}</pre><p className="field-hint">{continuing?'Session open':'Session ended'}</p></div>}
    {continuing && <form aria-label="USSD response" onSubmit={event=>{event.preventDefault();void send();}}><label className="field">{pinScreen?'USSD PIN':'Your response'}<input name="ussdAnswer" key={pinScreen?'pin':'answer'} type={pinScreen?'password':'text'} inputMode={pinScreen?'numeric':'text'} autoComplete="off" required maxLength={80} value={answer} onChange={event=>setAnswer(event.target.value)} disabled={busy}/></label><button className="button" disabled={busy} type="submit">{busy?'Sending…':'Send'}</button></form>}
  </section>;
}
