'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useReportRequest } from '@/lib/report-api';
import type { ProductReport } from '@/lib/report-types';
import { reportReasons, reportResolutions, reportStatuses } from '@/lib/report-types';
import type { RecordPage } from '@/lib/product-types';
import { verificationTime } from '@/lib/verification-types';
import { Pagination } from './product-fields';

function ReviewForm({ report, onSaved }: { report:ProductReport; onSaved:()=>void }) {
  const request = useReportRequest();
  const [status,setStatus] = useState<string>(report.status==='submitted' ? 'under_review' : report.status);
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try { await request(`/${report.id}/review`,'PUT',{...data,status,version:report.version,resolution:status==='resolved' ? data.resolution : null}); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to save review.'); }
    finally { setBusy(false); }
  }
  return <form className="record-form report-review" aria-label={`Review report ${report.id}`} onSubmit={submit} aria-busy={busy}>
    <h4>Administrator review</h4><fieldset disabled={busy}>
      <div className="field-grid"><label className="field">Review status<select name="status" value={status} onChange={event=>setStatus(event.target.value)}><option value="under_review">Under review</option>{report.status!=='submitted' && <option value="resolved">Resolved</option>}</select></label>
      {status==='resolved' && <label className="field">Resolution<select name="resolution" required defaultValue={report.resolution ?? ''}><option value="" disabled>Select resolution</option>{Object.entries(reportResolutions).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}</div>
      <label className="field">Response to farmer {status!=='resolved' && <span className="optional">(optional)</span>}<textarea name="response" required={status==='resolved'} maxLength={2000} rows={3} defaultValue={report.response ?? ''} /></label>
      <label className="field">Internal review note <span className="optional">(administrator only)</span><textarea name="internalNote" maxLength={2000} rows={3} defaultValue={report.internalNote ?? ''} /></label>
      <p className="field-hint">Reviewing a report does not change product or code status. Record any status changes separately in product management.</p>
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save review'}</button>
  </form>;
}

export function ReportHistory({ administrator = false, initialSearch = '', initialStatus = '' }: { administrator?:boolean; initialSearch?:string; initialStatus?:string }) {
  const request = useReportRequest();
  const [records,setRecords] = useState<RecordPage<ProductReport> | null>(null);
  const [query,setQuery] = useState({q:initialSearch,status:initialStatus,page:'1'});
  const [revision,setRevision] = useState(0); const [busy,setBusy] = useState(true);
  const [error,setError] = useState(''); const [notice,setNotice] = useState('');
  useEffect(()=>{
    const controller = new AbortController();
    request<RecordPage<ProductReport>>(`${administrator ? '' : '/mine'}?${new URLSearchParams(query)}`,'GET',undefined,controller.signal)
      .then(result=>{setRecords(result);setError('');})
      .catch(error=>{if(!controller.signal.aborted){setRecords(null);setError(error instanceof Error ? error.message : 'Unable to load reports.');}})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[administrator,request,query,revision]);
  function refresh() { setBusy(true);setRevision(value=>value+1); }
  function filter(event:FormEvent<HTMLFormElement>) {event.preventDefault();const data=new FormData(event.currentTarget);setBusy(true);setQuery({q:String(data.get('q')).trim(),status:String(data.get('status')),page:'1'});}
  return <section className="account-card"><div className="section-toolbar"><h2>{administrator ? 'All product reports' : 'My product reports'}</h2><button className="button button-secondary" disabled={busy} onClick={refresh}>Refresh reports</button></div>
    <form className="filters code-filters" aria-label="Filter product reports" onSubmit={filter}><label className="field">Search reports<input type="search" name="q" maxLength={160} defaultValue={initialSearch} placeholder="Product, code or seller" /></label><label className="field">Report status<select name="status" defaultValue={initialStatus}><option value="">All statuses</option>{Object.entries(reportStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="button button-secondary" disabled={busy}>Apply filters</button></form>
    {notice && <p className="form-success" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}{busy && <p role="status">Loading reports…</p>}
    {!busy && records && <>{records.items.length===0 ? <p className="empty-state">No reports found. Submit a concern or adjust the filters.</p> : records.items.map(report=><article key={`${report.id}:${report.updatedAt}`} className="history-record report-record">
      <div className="history-record-heading"><div><h3>#{report.id} — {report.productName}</h3><p className="cell-note">{reportReasons[report.reason]} · {verificationTime(report.createdAt)} EAT</p></div><span className={`status-badge report-${report.status}`}>{reportStatuses[report.status]}</span></div>
      <details><summary>View report details</summary><div className="report-details">
        <dl className="service-list"><div><dt>Category</dt><dd>{report.category==='seed' ? 'Seed' : 'Fertilizer'}</dd></div><div><dt>Package code</dt><dd>{report.codeValue ?? 'Not provided'}</dd></div><div><dt>Seller</dt><dd>{report.sellerName ?? 'Not provided'}</dd></div><div><dt>Seller location</dt><dd>{report.sellerLocation ?? 'Not provided'}</dd></div><div><dt>County (self-reported)</dt><dd>{report.county ?? 'Not provided'}</dd></div>{report.verificationId && <div><dt>Linked verification</dt><dd>#{report.verificationId}</dd></div>}{administrator && <div><dt>Reported by</dt><dd>{report.farmerName}</dd></div>}</dl>
        <h4>Reported concern</h4><p className="product-description">{report.description}</p>
        {report.response && <><h4>Administrator response</h4><p className="product-description">{report.response}</p></>}
        {report.resolution && <p><strong>Resolution:</strong> {reportResolutions[report.resolution]}</p>}
        <p className="field-hint">Updated {verificationTime(report.updatedAt)} EAT.</p>
        {administrator && <ReviewForm report={report} onSaved={()=>{setNotice(`Review saved for report #${report.id}.`);refresh();}} />}
      </div></details>
    </article>)}<Pagination {...records} busy={busy} onPage={page=>{setBusy(true);setQuery({...query,page:String(page)});}} /></>}
  </section>;
}
