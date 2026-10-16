'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useProductRequest } from '@/lib/product-api';
import type { ProductCode, RecordPage } from '@/lib/product-types';
import { Pagination, StatusBadge, StatusField } from './product-fields';

function CodeForm({ productId, code, onSaved, onCancel }: { productId: string; code?: ProductCode; onSaved: () => void; onCancel: () => void }) {
  const productRequest = useProductRequest();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setError(''); setBusy(true);
    try {
      await productRequest(`/${productId}/codes${code ? `/${code.id}` : ''}`, code ? 'PUT' : 'POST', data);
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save the code.'); }
    finally { setBusy(false); }
  }
  return <form className="record-form code-form" aria-label={code ? 'Edit verification code' : 'Add verification code'} onSubmit={submit} aria-busy={busy}>
    <h3>{code ? `Edit ${code.codeValue}` : 'Add verification code'}</h3>
    <fieldset disabled={busy}>
      <div className="field-grid">
        {!code && <label className="field">Verification code<input name="codeValue" required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9_\-]*" autoCapitalize="characters" spellCheck={false} aria-describedby="code-hint" /></label>}
        <label className="field">Batch number<input name="batchNumber" required maxLength={80} defaultValue={code?.batchNumber} /></label>
        <label className="field">Manufacture date <span className="optional">(optional)</span><input name="manufactureDate" type="date" min="1000-01-01" max="9999-12-31" defaultValue={code?.manufactureDate ?? ''} /></label>
        <label className="field">Expiry date<input name="expiryDate" type="date" min="1000-01-01" max="9999-12-31" required defaultValue={code?.expiryDate} /></label>
        <StatusField status={code?.status} />
      </div>
      <p className="field-hint" id="code-hint">{code ? 'The code value cannot be changed. Inactivate an incorrect code and add a replacement.' : 'Enter the unique code assigned to the product. Use letters, numbers, hyphens or underscores. Letters are saved in uppercase; the code cannot be changed after saving.'}</p>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="action-row"><button className="button" disabled={busy}>{busy ? 'Saving…' : code ? 'Save code' : 'Add code'}</button><button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>Cancel</button></div>
  </form>;
}

export function ProductCodes({ productId }: { productId: string }) {
  const productRequest = useProductRequest();
  const [records, setRecords] = useState<RecordPage<ProductCode> | null>(null);
  const [query, setQuery] = useState({ q: '', status: '', page: '1' });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
    {editing && <CodeForm key={editing === 'new' ? 'new' : editing.id} productId={productId} code={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setNotice(editing === 'new' ? 'Verification code added.' : 'Verification code updated.'); setEditing(null); setBusy(true); setRevision((value) => value + 1); }} />}
    <form className="filters code-filters" onSubmit={search} aria-label="Filter verification codes"><label className="field">Search codes<input name="q" type="search" maxLength={160} placeholder="Code or batch number" /></label><StatusField status="" all /><button className="button button-secondary" disabled={busy}>Search codes</button></form>
    {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => { setBusy(true); setRevision((value) => value + 1); }}>Retry</button></p>}
    {busy && <p role="status">Loading codes…</p>}
    {!busy && records && <>
      {records.items.length === 0 ? <p className="empty-state">No codes found. Add a code or adjust your search.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Verification codes"><table className="records-table"><thead><tr><th scope="col">Code / batch</th><th scope="col">Manufactured</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{records.items.map((code) => <tr key={code.id}><td><strong>{code.codeValue}</strong><span className="cell-note">{code.batchNumber}</span></td><td>{code.manufactureDate ?? 'Not provided'}</td><td>{code.expiryDate}</td><td><StatusBadge status={code.status} /></td><td><button className="text-button" disabled={editing !== null} onClick={() => { setNotice(''); setEditing(code); }} aria-label={`Edit code ${code.codeValue}`}>Edit</button></td></tr>)}</tbody></table></div>}
      <Pagination {...records} busy={busy} onPage={(page) => { setBusy(true); setQuery({ ...query, page: String(page) }); }} />
    </>}
  </section>;
}
