'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useProductRequest } from '@/lib/product-api';
import type { Product, RecordPage } from '@/lib/product-types';
import { ProductForm } from './product-form';
import { ProductCodes } from './product-codes';
import { Pagination, StatusBadge, StatusField } from './product-fields';

export function ProductManager({ initialProductId = '' }: { initialProductId?: string }) {
  const productRequest = useProductRequest();
  const router = useRouter();
  const [records, setRecords] = useState<RecordPage<Product> | null>(null);
  const [query, setQuery] = useState({ q: '', category: '', status: '', page: '1' });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Product | 'new' | null>(null);
  const [view, setView] = useState<'overview' | 'codes' | 'edit'>('overview');
  const [opening, setOpening] = useState(Boolean(initialProductId));
  const [openingError, setOpeningError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!initialProductId) return;
    const controller = new AbortController();
    productRequest<Product>(`/${initialProductId}`, 'GET', undefined, controller.signal)
      .then(product => { if (!controller.signal.aborted) setSelected(product); })
      .catch(reason => { if (!controller.signal.aborted) setOpeningError(reason instanceof Error ? reason.message : 'Unable to open this product.'); })
      .finally(() => { if (!controller.signal.aborted) setOpening(false); });
    return () => controller.abort();
  }, [initialProductId, productRequest]);
  useEffect(() => {
    const controller = new AbortController();
    productRequest<RecordPage<Product>>(`?${new URLSearchParams(query)}`, 'GET', undefined, controller.signal)
      .then((result) => { setRecords(result); setError(''); })
      .catch((error: Error) => { if (!controller.signal.aborted) { setError(error.message); setRecords(null); } })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [query, revision, productRequest]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setQuery({ q: String(data.get('q')).trim(), category: String(data.get('category')), status: String(data.get('status')), page: '1' });
  }
  function discard() { if(dirty && !window.confirm('Discard unsaved product changes?'))return false;setDirty(false);return true; }
  function section(next: typeof view) { if(next!==view && discard()){setView(next);setNotice('');} }
  function back() { if(!discard())return;if(initialProductId){router.push('/admin/products');return;}setSelected(null); setView('overview'); setNotice(''); setBusy(true); setRevision((value) => value + 1); }
  if (opening) return <section className="account-card" role="status">Opening product record…</section>;
  if (selected) return <>
    <button className="text-button product-back" onClick={back}>← Back to catalogue</button>
    <section className="account-card product-record-header" aria-labelledby="product-heading"><div className="section-toolbar"><div><p className="eyebrow">Product record</p><h2 id="product-heading">{selected === 'new' ? 'Add a product' : selected.name}</h2>{selected !== 'new' && <p className="cell-note">{selected.manufacturer} · {selected.category === 'seed' ? 'Seed' : 'Fertilizer'}</p>}</div>{selected !== 'new' && <StatusBadge status={selected.status}/>}</div>
      {notice && <p className="form-success" role="status">{notice}</p>}
      {selected === 'new' ? <ProductForm onDirtyChange={setDirty} onCancel={back} onSaved={product=>{setNotice('Product created. You can now generate package codes.');setSelected(product);setView('codes');}}/> : <nav className="product-sections" aria-label="Product sections">{([['overview','Overview'],['codes','Package codes'],['edit','Edit product']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={view===value} onClick={()=>section(value)}>{label}</button>)}</nav>}
    </section>
    {selected !== 'new' && view === 'overview' && <section className="account-card product-overview"><div className="section-toolbar"><h2>Product details</h2><button className="button button-secondary" onClick={()=>setView('edit')}>Edit details</button></div><dl className="product-facts"><div><dt>Manufacturer</dt><dd>{selected.manufacturer}</dd></div><div><dt>Category</dt><dd>{selected.category==='seed'?'Seed':'Fertilizer'}</dd></div><div><dt>Registration reference</dt><dd>{selected.registrationNo ?? 'Not provided'}</dd></div><div><dt>Product status</dt><dd><StatusBadge status={selected.status}/></dd></div></dl>{selected.description && <><h3>Description</h3><p className="product-description">{selected.description}</p></>}<div className="product-package-callout"><div><h3>Batches &amp; package codes</h3><p>Generate unique codes for a batch or update an individual package.</p></div><button className="button" onClick={()=>setView('codes')}>Manage package codes</button></div></section>}
    {selected !== 'new' && view === 'edit' && <section className="account-card"><h2>Edit product details</h2>{dirty && <p className="unsaved-notice" role="status">Unsaved product changes</p>}<ProductForm key={selected.id} product={selected} onDirtyChange={setDirty} cancelLabel="Cancel editing" onCancel={()=>section('overview')} onSaved={product=>{setNotice('Product updated.');setSelected(product);setView('overview');}}/></section>}
    {selected !== 'new' && view === 'codes' && <ProductCodes key={selected.id} productId={selected.id} />}
  </>;
  return <section className="account-card" aria-labelledby="products-heading">
    <div className="section-toolbar"><div><p className="eyebrow">Seed &amp; fertilizer records</p><h2 id="products-heading">Product catalogue</h2></div><button className="button" onClick={() => { setNotice(''); setSelected('new'); }}>Add product</button></div>
    <form className="filters" aria-label="Filter products" onSubmit={search}>
      <label className="field">Search products<input name="q" type="search" maxLength={160} placeholder="Name, manufacturer or reference" defaultValue={query.q} /></label>
      <label className="field">Category<select name="category" defaultValue={query.category}><option value="">All categories</option><option value="seed">Seed</option><option value="fertilizer">Fertilizer</option></select></label>
      <StatusField status={query.status as '' | Product['status']} all /><button className="button button-secondary" disabled={busy}>Search</button>
    </form>
    {openingError && <p className="form-error" role="alert">{openingError} Select a product from the catalogue below.</p>}
    {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => { setBusy(true); setRevision((value) => value + 1); }}>Retry</button></p>}
    {busy && <p role="status">Loading products…</p>}
    {!busy && records && <>
      {records.items.length === 0 ? <div className="empty-state"><h3>No products found</h3><p>Add your first product or adjust the search filters.</p></div> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Products"><table className="records-table"><thead><tr><th scope="col">Product</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Codes</th><th scope="col">Action</th></tr></thead><tbody>{records.items.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><span className="cell-note">{product.manufacturer}</span></td><td>{product.category === 'seed' ? 'Seed' : 'Fertilizer'}</td><td><StatusBadge status={product.status} /></td><td>{product.codeCount}</td><td><button className="text-button" onClick={() => router.push(`/admin/products?product=${product.id}`)} aria-label={`Manage ${product.name}`}>Open product →</button></td></tr>)}</tbody></table></div>}
      <Pagination {...records} busy={busy} onPage={(page) => { setBusy(true); setQuery({ ...query, page: String(page) }); }} />
    </>}
  </section>;
}
