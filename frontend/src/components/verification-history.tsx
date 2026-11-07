'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { RecordPage } from '@/lib/product-types';
import type { VerificationRecord } from '@/lib/verification-types';
import { productReportHref, resultLabels, verificationTime } from '@/lib/verification-types';
import { Pagination } from './product-fields';
import { ResultBadge, VerificationDetails } from './verification-result';
import Link from 'next/link';
import { RecordFilters } from './record-filters';

export function VerificationHistory({ administrator = false, initialSearch = '', initialResult = '' }: { administrator?: boolean; initialSearch?:string; initialResult?:string }) {
  const router = useRouter();
  const [records, setRecords] = useState<RecordPage<VerificationRecord> | null>(null);
  const [query, setQuery] = useState<Record<string, string>>({ q: initialSearch, result: initialResult, from: '', to: '', page: '1', ...(administrator ? { actor: '' } : {}) });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/verifications${administrator ? '' : '/mine'}?${new URLSearchParams(query)}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (response.status === 401) { router.replace('/login'); router.refresh(); return; }
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Unable to load history.');
        setRecords(result); setError('');
      } catch (error) { if (!controller.signal.aborted) { setRecords(null); setError(error instanceof Error ? error.message : 'Unable to load history.'); } }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load(); return () => controller.abort();
  }, [administrator, query, revision, router]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setQuery({ ...values, page: '1' });
  }
  return <section className="account-card" aria-labelledby="history-heading">
    <div className="section-toolbar"><h2 id="history-heading">{administrator ? 'All verification records' : `Saved checks${records ? ` (${records.total})` : ''}`}</h2><button className="button button-secondary" disabled={busy} onClick={() => { setBusy(true); setRevision((value) => value + 1); }}>Refresh records</button></div>
    <p className="field-hint">Search by code, product name or batch. Dates use East Africa Time; product details are saved as they were when checked.</p>
    <RecordFilters collapsible={!administrator} label="Search and filter checks" active={!!(query.q || query.result || query.from || query.to)}><form className="history-filters" onSubmit={search} aria-label="Filter verification history">
      <label className="field">Search history<input name="q" type="search" maxLength={160} defaultValue={initialSearch} placeholder="Code, product or batch" /></label>
      <label className="field">Result<select name="result" defaultValue={initialResult}><option value="">All results</option>{Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {administrator && <label className="field">Account type<select name="actor" defaultValue=""><option value="">All accounts</option><option value="farmer">Farmer</option><option value="guest">Guest</option><option value="administrator">Administrator</option></select></label>}
      <label className="field">From date<input name="from" type="date" min="1000-01-01" max="9999-12-31" /></label>
      <label className="field">To date<input name="to" type="date" min="1000-01-01" max="9999-12-31" /></label>
      <button className="button button-secondary" disabled={busy}>Apply filters</button>
      {!administrator && <button className="text-button" type="reset" disabled={busy} onClick={()=>{setBusy(true);setQuery({q:'',result:'',from:'',to:'',page:'1'});}}>Clear filters</button>}
    </form></RecordFilters>
    {busy && <p role="status">Loading verification history…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {!busy && records && <>
      {records.items.length === 0 ? <div className="empty-state"><h3>No verification records found</h3><p>Check a product code or adjust your filters.</p>{!administrator && <Link className="button" href="/verify">Verify a product</Link>}</div> : <div className="history-records">{records.items.map((record) => <article className="history-record" key={record.id}>
        <div className="history-record-heading"><div><h3>{record.product?.name ?? (record.enteredCode || 'Empty code')}</h3><span className="cell-note">Code: {record.enteredCode || '(empty)'} · {verificationTime(record.verifiedAt)} EAT</span></div><ResultBadge result={record.result} /></div>
        {administrator && <p className="field-hint">{record.actorRole === 'farmer' ? `Farmer: ${record.farmerName ?? 'Account removed'}` : record.actorRole === 'administrator' ? 'Administrator check' : 'Guest check'}{record.county ? ` · ${record.county}` : ''} · {record.channel}</p>}
        <details><summary>{administrator ? 'Review result & assessment' : 'View saved details'}</summary><VerificationDetails record={record} administrator={administrator} /></details>
        {!administrator && <p className="history-record-action"><Link href={productReportHref(record,true)}>Report this product <span aria-hidden="true">→</span></Link></p>}
      </article>)}</div>}
      <Pagination {...records} busy={busy} onPage={(page) => { setBusy(true); setQuery({ ...query, page: String(page) }); }} />
    </>}
  </section>;
}
