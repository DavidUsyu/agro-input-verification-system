'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useProductRequest } from '@/lib/product-api';
import type { Product, RecordPage } from '@/lib/product-types';
import { ProductForm } from './product-form';
import { ProductCodes } from './product-codes';
import { Pagination, StatusBadge, StatusField } from './product-fields';

export function ProductManager() {
  const productRequest = useProductRequest();
  const [records, setRecords] = useState<RecordPage<Product> | null>(null);
  const [query, setQuery] = useState({ q: '', category: '', status: '', page: '1' });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Product | 'new' | null>(null);
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
  function back() { setSelected(null); setNotice(''); setBusy(true); setRevision((value) => value + 1); }
  if (selected) return <>
    <section className="account-card" aria-labelledby="product-heading"><p className="eyebrow">Product record</p><h2 id="product-heading">{selected === 'new' ? 'Add a product' : selected.name}</h2>
      {notice && <p className="form-success" role="status">{notice}</p>}
      <ProductForm key={selected === 'new' ? 'new' : selected.id} product={selected === 'new' ? undefined : selected} onCancel={back} onSaved={(product) => { setNotice(selected === 'new' ? 'Product created. You can now add verification codes below.' : 'Product updated.'); setSelected(product); }} />
    </section>
    {selected !== 'new' && <ProductCodes key={selected.id} productId={selected.id} />}
  </>;
  return <section className="account-card" aria-labelledby="products-heading">
    <div className="section-toolbar"><div><p className="eyebrow">Seed &amp; fertilizer records</p><h2 id="products-heading">Product catalogue</h2></div><button className="button" onClick={() => { setNotice(''); setSelected('new'); }}>Add product</button></div>
    <form className="filters" aria-label="Filter products" onSubmit={search}>
      <label className="field">Search products<input name="q" type="search" maxLength={160} placeholder="Name, manufacturer or reference" defaultValue={query.q} /></label>
      <label className="field">Category<select name="category" defaultValue={query.category}><option value="">All categories</option><option value="seed">Seed</option><option value="fertilizer">Fertilizer</option></select></label>
      <StatusField status={query.status as '' | Product['status']} all /><button className="button button-secondary" disabled={busy}>Search</button>
    </form>
    {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => { setBusy(true); setRevision((value) => value + 1); }}>Retry</button></p>}
    {busy && <p role="status">Loading products…</p>}
    {!busy && records && <>
      {records.items.length === 0 ? <div className="empty-state"><h3>No products found</h3><p>Add your first product or adjust the search filters.</p></div> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Products"><table className="records-table"><thead><tr><th scope="col">Product</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Codes</th><th scope="col">Action</th></tr></thead><tbody>{records.items.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><span className="cell-note">{product.manufacturer}</span></td><td>{product.category === 'seed' ? 'Seed' : 'Fertilizer'}</td><td><StatusBadge status={product.status} /></td><td>{product.codeCount}</td><td><button className="text-button" onClick={() => setSelected(product)} aria-label={`Manage ${product.name}`}>Manage</button></td></tr>)}</tbody></table></div>}
      <Pagination {...records} busy={busy} onPage={(page) => { setBusy(true); setQuery({ ...query, page: String(page) }); }} />
    </>}
  </section>;
}
