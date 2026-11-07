'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VerificationRecord } from '@/lib/verification-types';
import { verificationTime } from '@/lib/verification-types';
import type { ProductReport } from '@/lib/report-types';
import { reportStatuses } from '@/lib/report-types';
import { ResultBadge } from './verification-result';

interface Activity<T> { items: T[]; error?: boolean }
export function FarmerRecentActivity() {
  const router=useRouter();
  const [checks,setChecks]=useState<Activity<VerificationRecord> | null>(null);
  const [reports,setReports]=useState<Activity<ProductReport> | null>(null);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function load<T>(path:string,update:(value:Activity<T>)=>void) {
      try {
        const response=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
        if(response.status===401){router.replace('/login');router.refresh();return;}
        if(!response.ok)throw new Error();
        const result=await response.json();if(!controller.signal.aborted)update({items:result.items.slice(0,3)});
      } catch { if(!controller.signal.aborted)update({items:[],error:true}); }
    }
    void load<VerificationRecord>('/api/verifications/mine',setChecks);
    void load<ProductReport>('/api/reports/mine',setReports);
    return ()=>controller.abort();
  },[revision,router]);
  function retry(){setChecks(null);setReports(null);setRevision(value=>value+1);}
  return <section className="farmer-recent" aria-labelledby="farmer-activity-heading"><div className="section-toolbar"><h2 id="farmer-activity-heading">Your recent activity</h2><button type="button" className="text-button" onClick={retry} disabled={!checks || !reports}>Refresh activity</button></div><div className="farmer-recent-grid">
    <section className="account-card"><div className="section-toolbar"><h3>Latest checks</h3><Link href="/farmer/history">View all checks</Link></div>
      {!checks ? <p role="status">Loading your checks…</p> : checks.error ? <p role="alert">Your checks could not be loaded. Use Refresh activity to try again.</p> : !checks.items.length ? <div className="farmer-empty"><p>No saved checks yet.</p><Link href="/verify">Verify your first product →</Link></div> : <ul className="farmer-activity-list">{checks.items.map(record=><li key={record.id}><div><strong>{record.product?.name ?? record.enteredCode}</strong><span className="cell-note">{verificationTime(record.verifiedAt)} EAT</span></div><ResultBadge result={record.result}/></li>)}</ul>}
    </section>
    <section className="account-card"><div className="section-toolbar"><h3>Latest reports</h3><Link href="/farmer/reports">View all reports</Link></div>
      {!reports ? <p role="status">Loading your reports…</p> : reports.error ? <p role="alert">Your reports could not be loaded. Use Refresh activity to try again.</p> : !reports.items.length ? <div className="farmer-empty"><p>No product concerns reported.</p><p>If you notice a problem, you can <Link href="/farmer/reports/new">report it here</Link>.</p></div> : <ul className="farmer-activity-list">{reports.items.map(report=><li key={report.id}><div><strong>{report.productName}</strong><span className="cell-note">Report #{report.id} · {verificationTime(report.createdAt)} EAT</span></div><span className={`status-badge report-${report.status}`}>{reportStatuses[report.status]}</span></li>)}</ul>}
    </section>
  </div></section>;
}
