'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { countyNames } from '@/lib/counties';
import { useReportRequest } from '@/lib/report-api';
import type { CatalogueProduct, ProductReport } from '@/lib/report-types';
import { reportReasons } from '@/lib/report-types';

export function ReportForm({ code = '', verificationId = '', initialProduct, initialName = '', initialCategory = 'seed' }: { code?: string; verificationId?: string; initialProduct?:CatalogueProduct; initialName?:string; initialCategory?:'seed'|'fertilizer' }) {
  const request = useReportRequest();
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CatalogueProduct | null>(initialProduct ?? null);
  const [name, setName] = useState(initialProduct?.name ?? initialName);
  const [category, setCategory] = useState<string>(initialProduct?.category ?? initialCategory);
  const [catalogueError, setCatalogueError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ProductReport | null>(null);
  const confirmation=useRef<HTMLElement>(null);
  useEffect(()=>{if(saved)confirmation.current?.focus();},[saved]);
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
    const fields=new FormData(event.currentTarget); fields.delete('catalogueProduct');
    const data = Object.fromEntries(fields);
    setBusy(true); setError('');
    try {
      setSaved(await request<ProductReport>('', 'POST', { ...data, productId:selected?.id ?? null, productName:name, category, verificationId:verificationId || null }));
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to submit your report. Please try again.'); }
    finally { setBusy(false); }
  }
  if (saved) return <section ref={confirmation} tabIndex={-1} className="account-card report-confirmation" role="status"><span className="result-symbol result-verified" aria-hidden="true">✓</span><p className="eyebrow">Report received</p><h2>Report #{saved.id} submitted</h2><p>Your concern about <strong>{saved.productName}</strong> is awaiting administrator review.</p><div className="result-next-step"><strong>What happens next?</strong><p>An administrator will review your concern. Open My reports to see its status and any response.</p></div><div className="action-row"><Link className="button" href="/farmer/reports">View my reports</Link><Link className="button button-secondary" href="/verify">Verify another product</Link></div></section>;
  const options = selected && !catalogue.some(item=>item.id===selected.id) ? [selected,...catalogue] : catalogue;
  return <section className="account-card farmer-report-form"><h2>Tell us what you observed</h2><p className="field-hint">Your report will be reviewed by an administrator. Fields marked optional can be left blank.</p>
    {verificationId && <p className="linked-check-note">Linked to your verification #{verificationId}. The package code is already filled in. <Link href="/farmer/reports/new">Report a different product</Link>.</p>}
    <form className="record-form" aria-label="Report a product" aria-busy={busy} onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend><span className="form-section-number">1</span>Which product?</legend>
        <details className="catalogue-picker"><summary>{selected?'Change catalogue product':'Find a product in the catalogue (optional)'}</summary>
        <label className="field">Search catalogue<input type="search" value={search} maxLength={160} onChange={event=>setSearch(event.target.value)} placeholder="Product name or manufacturer" /></label>
        {loading && <p className="field-hint" role="status">Loading catalogue…</p>}
        {catalogueError && <p className="form-error" role="alert">{catalogueError} You can enter the product details below.</p>}
        <label className="field">Catalogue product<select name="catalogueProduct" value={selected?.id ?? ''} onChange={event=>{
          const product = options.find(item=>item.id===event.target.value) ?? null;
          setSelected(product); setName(product?.name ?? ''); if (product) setCategory(product.category);
        }}><option value="">Not listed / enter product details</option>{options.map(product=><option key={product.id} value={product.id}>{product.name}{product.manufacturer?` — ${product.manufacturer}`:''}</option>)}</select></label></details>
        <div className="field-grid">
          <label className="field">Product name<input name="productName" required maxLength={160} value={name} readOnly={!!selected} onChange={event=>setName(event.target.value)} /></label>
          <label className="field">Category<select name="category" value={category} disabled={!!selected} onChange={event=>setCategory(event.target.value)}><option value="seed">Seed</option><option value="fertilizer">Fertilizer</option></select></label>
          <label className="field">Package code <span className="optional">(optional)</span><input name="codeValue" maxLength={80} defaultValue={code} readOnly={!!verificationId} autoCapitalize="characters" spellCheck={false} /></label>
        </div>
      </fieldset>
      <fieldset disabled={busy}><legend><span className="form-section-number">2</span>What is the concern?</legend>
        <label className="field">Reason for concern<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option>{Object.entries(reportReasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field">Describe your concern<textarea name="description" required minLength={10} maxLength={2000} rows={4} placeholder="What did you notice about the packaging, label or product?" /></label>
        <p className="field-hint">Use 10–2,000 characters. Include what you observed; leave out passwords and payment details.</p>
      </fieldset>
      <fieldset disabled={busy}><legend><span className="form-section-number">3</span>Where did you find it? <span className="optional">(optional)</span></legend>
        <p className="field-hint">These details can help the review. This form does not request your device location.</p>
        <div className="field-grid">
          <label className="field">Seller name <span className="optional">(optional)</span><input name="sellerName" maxLength={160} /></label>
          <label className="field">Seller location <span className="optional">(optional)</span><input name="sellerLocation" maxLength={300} placeholder="Shop, market or town" /></label>
          <label className="field">County of concern <span className="optional">(optional)</span><select name="county" defaultValue=""><option value="">Not provided</option>{countyNames.map(county=><option key={county} value={county}>{county}</option>)}</select></label>
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="action-row"><button className="button" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button><Link className="button button-secondary" href="/farmer/reports">My reports</Link></div><p className="field-hint">A report raises a concern for investigation. It does not automatically mark a product as counterfeit.</p>
    </form>
  </section>;
}
