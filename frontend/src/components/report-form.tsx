'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { countyNames } from '@/lib/counties';
import { useReportRequest } from '@/lib/report-api';
import type { CatalogueProduct, ProductReport } from '@/lib/report-types';
import { reportReasons } from '@/lib/report-types';

export function ReportForm({ code = '', verificationId = '' }: { code?: string; verificationId?: string }) {
  const request = useReportRequest();
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CatalogueProduct | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('seed');
  const [catalogueError, setCatalogueError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ProductReport | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      request<{items:CatalogueProduct[]}>(`/catalogue?q=${encodeURIComponent(search)}`, 'GET', undefined, controller.signal)
        .then(result => { setCatalogue(result.items); setCatalogueError(''); })
        .catch(error => { if (!controller.signal.aborted) setCatalogueError(error instanceof Error ? error.message : 'Catalogue unavailable. You can enter product details manually.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, request]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      setSaved(await request<ProductReport>('', 'POST', { ...data, productId:selected?.id ?? null, productName:name, category, verificationId:verificationId || null }));
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to submit your report. Please try again.'); }
    finally { setBusy(false); }
  }
  if (saved) return <section className="account-card" role="status"><p className="eyebrow">Report received</p><h2>Report #{saved.id} submitted</h2><p>Your concern about {saved.productName} is awaiting administrator review. You can follow its progress in My reports.</p><div className="action-row"><Link className="button" href="/farmer/reports">View my reports</Link><Link className="button button-secondary" href="/verify">Verify another product</Link></div></section>;
  const options = selected && !catalogue.some(item=>item.id===selected.id) ? [selected,...catalogue] : catalogue;
  return <section className="account-card"><h2>Tell us what you observed</h2><p>A report raises a concern for investigation. It does not automatically mark a product as counterfeit.</p>
    {verificationId && <p className="record-note">Linked to your verification #{verificationId}. The package code must stay the same. <Link href="/farmer/reports/new">Start an unlinked report</Link>.</p>}
    <form className="record-form" aria-label="Report a product" aria-busy={busy} onSubmit={submit}>
      <fieldset disabled={busy}>
        <label className="field">Search catalogue <span className="optional">(optional)</span><input type="search" value={search} maxLength={160} onChange={event=>setSearch(event.target.value)} placeholder="Product name or manufacturer" /></label>
        {loading && <p className="field-hint" role="status">Loading catalogue…</p>}
        {catalogueError && <p className="form-error" role="alert">{catalogueError} You can enter the product details below.</p>}
        <label className="field">Catalogue product<select value={selected?.id ?? ''} onChange={event=>{
          const product = options.find(item=>item.id===event.target.value) ?? null;
          setSelected(product); setName(product?.name ?? ''); if (product) setCategory(product.category);
        }}><option value="">Not listed / enter product details</option>{options.map(product=><option key={product.id} value={product.id}>{product.name} — {product.manufacturer}</option>)}</select></label>
        <div className="field-grid">
          <label className="field">Product name<input name="productName" required maxLength={160} value={name} readOnly={!!selected} onChange={event=>setName(event.target.value)} /></label>
          <label className="field">Category<select name="category" value={category} disabled={!!selected} onChange={event=>setCategory(event.target.value)}><option value="seed">Seed</option><option value="fertilizer">Fertilizer</option></select></label>
          <label className="field">Package code <span className="optional">(optional)</span><input name="codeValue" maxLength={80} defaultValue={code} readOnly={!!verificationId} autoCapitalize="characters" spellCheck={false} /></label>
          <label className="field">Reason for concern<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option>{Object.entries(reportReasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field">Seller name <span className="optional">(optional)</span><input name="sellerName" maxLength={160} /></label>
          <label className="field">Seller location <span className="optional">(optional)</span><input name="sellerLocation" maxLength={300} placeholder="Shop, market or town" /></label>
          <label className="field">County of concern <span className="optional">(optional)</span><select name="county" defaultValue=""><option value="">Not provided</option>{countyNames.map(county=><option key={county} value={county}>{county}</option>)}</select></label>
        </div>
        <label className="field">Describe your concern<textarea name="description" required minLength={10} maxLength={2000} rows={5} placeholder="Describe the packaging, label or other issue you noticed." /></label>
        <p className="field-hint">Use 10–2,000 characters. Include relevant observations and avoid passwords or payment details. The county above is supplied by you; this form does not request GPS.</p>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="action-row"><button className="button" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button><Link className="button button-secondary" href="/farmer/reports">My reports</Link></div>
    </form>
  </section>;
}
