'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useProductRequest } from '@/lib/product-api';
import type { GeneratedCodes, ProductCode, RecordPage, RecordStatus } from '@/lib/product-types';
import { Pagination, StatusBadge, StatusField } from './product-fields';
import { countyNames } from '@/lib/counties';

function CodeForm({ productId, code, onSaved, onCancel }: { productId: string; code?: ProductCode; onSaved: (saved: ProductCode[]) => void; onCancel: () => void }) {
  const productRequest = useProductRequest();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setError(''); setBusy(true);
    try {
      if (code) {
        const saved = await productRequest<ProductCode>(`/${productId}/codes/${code.id}`, 'PUT', data);
        onSaved([saved]);
      } else {
        const saved = await productRequest<GeneratedCodes>(`/${productId}/codes/bulk`, 'POST', { ...data, quantity: Number(data.quantity) });
        onSaved(saved.items);
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save the code.'); }
    finally { setBusy(false); }
  }
  return <form className="record-form code-form" aria-label={code ? 'Edit verification code' : 'Generate verification code'} onSubmit={submit} aria-busy={busy}>
    <h3>{code ? `Edit ${code.codeValue}` : 'Generate package codes'}</h3>
    <fieldset disabled={busy}>
      <div className="field-grid">
        {!code && <label className="field">Number of packages<input name="quantity" type="number" min={1} max={1000} step={1} required defaultValue={1} aria-describedby="code-hint" /></label>}
        <label className="field">Batch number<input name="batchNumber" required maxLength={80} defaultValue={code?.batchNumber} /></label>
        <label className="field">Distribution county<select name="distributionCounty" defaultValue={code?.distributionCounty ?? ''} required={!code}><option value="" disabled={!code}>{code ? 'Not assigned (requires review)' : 'Select county'}</option>{countyNames.map((county) => <option key={county} value={county}>{county}</option>)}</select></label>
        <label className="field">Manufacture date <span className="optional">(optional)</span><input name="manufactureDate" type="date" min="1000-01-01" max="9999-12-31" defaultValue={code?.manufactureDate ?? ''} /></label>
        <label className="field">Expiry date<input name="expiryDate" type="date" min="1000-01-01" max="9999-12-31" required defaultValue={code?.expiryDate} /></label>
        <StatusField status={code?.status} />
      </div>
      <p className="field-hint" id="code-hint">{code ? 'The printed code stays fixed. Update the distribution county when an approved transfer occurs.' : 'Generate 1–1,000 packages at once. Each gets a different code and shares the batch, dates, status and distribution county entered here.'}</p>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="action-row"><button className="button" disabled={busy}>{busy ? 'Saving…' : code ? 'Save code' : 'Generate code'}</button><button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>Cancel</button></div>
  </form>;
}

function downloadCodes(codes: ProductCode[]) {
  const url = URL.createObjectURL(new Blob([codes.map((code) => code.codeValue).join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'package-codes.txt';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProductCodes({ productId }: { productId: string }) {
  const productRequest = useProductRequest();
  const [records, setRecords] = useState<RecordPage<ProductCode> | null>(null);
  const [query, setQuery] = useState({ q: '', status: '', page: '1' });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generated, setGenerated] = useState<ProductCode[]>([]);
  const [editing, setEditing] = useState<ProductCode | 'new' | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    productRequest<RecordPage<ProductCode>>(`/${productId}/codes?${new URLSearchParams(query)}`, 'GET', undefined, controller.signal)
      .then((result) => { setRecords(result); setError(''); })
      .catch((error: Error) => { if (!controller.signal.aborted) { setError(error.message); setRecords(null); } })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [productId, query, revision, productRequest]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setQuery({ q: String(data.get('q')).trim(), status: String(data.get('status')), page: '1' });
  }
  return <section className="account-card" aria-labelledby="codes-heading">
    <div className="section-toolbar"><div><p className="eyebrow">Product identification</p><h2 id="codes-heading">Verification codes</h2></div><button className="button" disabled={editing !== null} onClick={() => { setNotice(''); setEditing('new'); }}>New code</button></div>
    <p className="field-hint">Each code belongs to this product and is unique across the system. Dates are shown as year-month-day. Expiry is separate from the record status.</p>
    {notice && <p className="form-success" role="status">{notice}</p>}
    {editing && <CodeForm key={editing === 'new' ? 'new' : editing.id} productId={productId} code={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={(saved) => {
      if (editing === 'new') {
        setNotice(saved.length === 1 ? `Verification code generated: ${saved[0].codeValue}` : `${saved.length} package codes generated for batch ${saved[0].batchNumber}.`);
        setGenerated(saved);
        setQuery({ q: saved[0].batchNumber, status: '', page: '1' });
      } else { setNotice('Verification code updated.'); setGenerated([]); }
      setEditing(null); setBusy(true); setRevision((value) => value + 1);
    }} />}
    {generated.length > 0 && <div className="record-form" role="region" aria-label="Generated package codes">
      <h3>Generated codes — batch {generated[0].batchNumber}</h3>
      <p className="field-hint">{generated.length} package{generated.length === 1 ? '' : 's'} saved. Copy or download the codes below, one code per package. Saved codes remain available in the list.</p>
      <label className="field">Package codes<textarea readOnly rows={Math.min(8, generated.length + 1)} value={generated.map((code) => code.codeValue).join('\n')} onFocus={(event) => event.currentTarget.select()} /></label>
      <button className="button button-secondary" type="button" onClick={() => downloadCodes(generated)}>Download codes</button>
    </div>}
    <form key={`${query.q}:${query.status}`} className="filters code-filters" onSubmit={search} aria-label="Filter verification codes"><label className="field">Search codes<input name="q" type="search" maxLength={160} defaultValue={query.q} placeholder="Code or batch number" /></label><StatusField status={query.status as RecordStatus | ''} all /><button className="button button-secondary" disabled={busy}>Search codes</button></form>
    {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => { setBusy(true); setRevision((value) => value + 1); }}>Retry</button></p>}
    {busy && <p role="status">Loading codes…</p>}
    {!busy && records && <>
      {records.items.length === 0 ? <p className="empty-state">No codes found. Generate a code or adjust your search.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Verification codes"><table className="records-table"><thead><tr><th scope="col">Code / batch</th><th scope="col">Distribution county</th><th scope="col">Manufactured</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{records.items.map((code) => <tr key={code.id}><td><strong>{code.codeValue}</strong><span className="cell-note">{code.batchNumber}</span></td><td>{code.distributionCounty ?? 'Not assigned — edit to assign'}</td><td>{code.manufactureDate ?? 'Not provided'}</td><td>{code.expiryDate}</td><td><StatusBadge status={code.status} /></td><td><button className="text-button" disabled={editing !== null} onClick={() => { setNotice(''); setEditing(code); }} aria-label={`Edit code ${code.codeValue}`}>Edit</button></td></tr>)}</tbody></table></div>}
      <Pagination {...records} busy={busy} onPage={(page) => { setBusy(true); setQuery({ ...query, page: String(page) }); }} />
    </>}
  </section>;
}
