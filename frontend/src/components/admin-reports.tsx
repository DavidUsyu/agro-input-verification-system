'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useReportRequest } from '@/lib/report-api';
import type { ProductReport } from '@/lib/report-types';
import { reportReasons, reportResolutions, reportStatuses } from '@/lib/report-types';
import type { RecordPage } from '@/lib/product-types';
import { resultLabels, verificationTime } from '@/lib/verification-types';
import type { VerificationOutcome } from '@/lib/verification-types';
import { Pagination } from './product-fields';
import { ReviewForm } from './report-history';

export function AdminReports({ initialSearch='', initialStatus='' }: { initialSearch?:string; initialStatus?:string }) {
  const request=useReportRequest();
  const [query,setQuery]=useState({q:initialSearch,status:initialStatus,page:'1'});
  const [records,setRecords]=useState<RecordPage<ProductReport>|null>(null);
  const [selectedId,setSelectedId]=useState('');
  const [revision,setRevision]=useState(0); const [busy,setBusy]=useState(true);
  const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const [dirty,setDirty]=useState(false);
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{
    const controller=new AbortController();
    request<RecordPage<ProductReport>>(`?${new URLSearchParams(query)}`,'GET',undefined,controller.signal)
      .then(data=>{if(!controller.signal.aborted){setRecords(data);setError('');}})
      .catch(reason=>{if(!controller.signal.aborted){setRecords(null);setError(reason instanceof Error?reason.message:'Unable to load reports.');}})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[query,revision,request]);
  useEffect(()=>{
    if(!dirty)return;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    const navigate=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest('a[href]'):null;
      if(target && !window.confirm('Leave this report and discard unsaved review changes?')){event.preventDefault();event.stopPropagation();}
    };
    window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true);
    return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true);};
  },[dirty]);
  function discard(){if(dirty && !window.confirm('Discard unsaved review changes?'))return false;setDirty(false);return true;}
  function refresh(){if(!discard())return;setBusy(true);setRevision(value=>value+1);}
  function filter(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!discard())return;const values=new FormData(event.currentTarget);setSelectedId('');setBusy(true);setQuery({q:String(values.get('q')).trim(),status:String(values.get('status')),page:'1'});}
  const selected=records?.items.find(report=>report.id===selectedId) ?? records?.items[0];
  function select(id:string){if(id===selected?.id || !discard())return;setSelectedId(id);panel.current?.focus();}
  return <>
    <section className="account-card report-controls"><div className="section-toolbar"><div><h2>Report queue</h2><p className="field-hint">Choose a report to investigate, add notes, and respond.</p></div><button className="button button-secondary" onClick={refresh} disabled={busy}>Refresh reports</button></div>
      <form className="filters code-filters" aria-label="Filter product reports" onSubmit={filter}><label className="field">Search reports<input name="q" type="search" maxLength={160} defaultValue={initialSearch} placeholder="Product, code or seller"/></label><label className="field">Report status<select name="status" defaultValue={initialStatus}><option value="">All statuses</option>{Object.entries(reportStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="button button-secondary" disabled={busy}>Apply filters</button></form>
    </section>
    {notice && <p className="form-success" role="status">{notice}</p>}
    {busy && <p role="status">Loading reports…</p>}{error && <p role="alert" className="form-error">{error} <button className="text-button" onClick={refresh}>Retry</button></p>}
    {!busy && records && <>{records.items.length===0 ? <div className="account-card empty-state"><h2>No reports found</h2><p>Try another search or choose a different status.</p></div> : <div className="report-workspace">
      <section className="report-queue account-card" aria-label="Product report queue"><div className="report-queue-heading"><h2>Reports</h2><span>{records.total} total</span></div><div className="report-queue-list">{records.items.map(report=><button key={report.id} type="button" className="report-queue-item" data-report-id={report.id} aria-pressed={report.id===selected?.id} onClick={()=>select(report.id)}><span className="queue-item-meta">#{report.id}<span className={`status-badge report-${report.status}`}>{reportStatuses[report.status]}</span></span><strong>{report.productName}</strong><span>{reportReasons[report.reason]}</span><span className="cell-note">{verificationTime(report.createdAt)} EAT</span></button>)}</div></section>
      {selected && <section className="report-review-panel account-card" aria-label={`Selected report ${selected.id}`} ref={panel} tabIndex={-1}>
        <div className="report-panel-heading"><div><p className="eyebrow">Report #{selected.id}</p><h2>{selected.productName}</h2><p>{reportReasons[selected.reason]}</p></div><span className={`status-badge report-${selected.status}`}>{reportStatuses[selected.status]}</span></div>
        <ol className="report-progress" aria-label="Report review progress">{Object.entries(reportStatuses).map(([status,label])=><li key={status} aria-current={selected.status===status?'step':undefined}>{label}</li>)}</ol>
        <div className="report-panel-grid">
          <div className="report-evidence"><h3>Farmer’s concern</h3><p className="product-description concern-description">{selected.description}</p><dl className="report-facts">
            <div><dt>Reported by</dt><dd>{selected.farmerName ?? 'Farmer'}</dd></div><div><dt>Category</dt><dd>{selected.category==='seed'?'Seed':'Fertilizer'}</dd></div><div><dt>Package code</dt><dd>{selected.codeValue ?? 'Not provided'}</dd></div><div><dt>Seller</dt><dd>{selected.sellerName ?? 'Not provided'}</dd></div><div><dt>Seller location</dt><dd>{selected.sellerLocation ?? 'Not provided'}</dd></div><div><dt>County (self-reported)</dt><dd>{selected.county ?? 'Not provided'}</dd></div><div><dt>Received</dt><dd>{verificationTime(selected.createdAt)} EAT · {selected.channel==='ussd'?'USSD':'Web'}</dd></div>
          </dl>
          <section className="related-verification" aria-label="Related verification"><h3>Related verification</h3>{selected.verificationId ? <><p>Saved check #{selected.verificationId}</p><p><strong>{resultLabels[selected.verificationResult as VerificationOutcome] ?? 'Result unavailable'}</strong></p><p className="field-hint">Result recorded when the report was submitted.</p></> : <p className="field-hint">The farmer did not link a verification record.</p>}{selected.codeValue && <Link href={`/admin/verifications?q=${encodeURIComponent(selected.codeValue)}`}>View checks for this code →</Link>}</section>
          {selected.productId && <p><Link href={`/admin/products?product=${selected.productId}`}>Open product record →</Link></p>}
          </div>
          <div className="report-decision"><div className="review-help"><h3>Review and respond</h3><p>{selected.status==='submitted'?'Start by moving this report to Under review. Resolve it after investigation.':'Record your findings. Resolving a report requires a resolution and a response to the farmer.'}</p></div>{dirty && <p className="unsaved-notice" role="status">Unsaved review changes</p>}
            <ReviewForm key={`${selected.id}:${selected.updatedAt}:${revision}`} report={selected} onDirtyChange={setDirty} onSaved={()=>{setNotice(`Review saved for report #${selected.id}.`);setBusy(true);setRevision(value=>value+1);}}/>
            {selected.resolution && <p><strong>Current resolution:</strong> {reportResolutions[selected.resolution]}</p>}
          </div>
        </div>
      </section>}
    </div>}
    <Pagination {...records} busy={busy} onPage={page=>{if(discard()){setBusy(true);setSelectedId('');setQuery({...query,page:String(page)});}}}/></>}
  </>;
}
