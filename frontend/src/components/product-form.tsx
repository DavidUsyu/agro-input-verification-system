'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useProductRequest } from '@/lib/product-api';
import type { Product } from '@/lib/product-types';
import { StatusField } from './product-fields';

export function ProductForm({ product, onSaved, onCancel }: { product?: Product; onSaved: (product: Product) => void; onCancel: () => void }) {
  const productRequest = useProductRequest();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try { onSaved(await productRequest<Product>(product ? `/${product.id}` : '', product ? 'PUT' : 'POST', data)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to save. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="record-form" aria-label={product ? 'Edit product' : 'Add product'} aria-busy={busy}>
    <fieldset disabled={busy}>
      <div className="field-grid">
        <label className="field">Product name<input name="name" required maxLength={160} defaultValue={product?.name} /></label>
        <label className="field">Category<select name="category" defaultValue={product?.category ?? 'seed'} required><option value="seed">Seed</option><option value="fertilizer">Fertilizer</option></select></label>
        <label className="field">Manufacturer<input name="manufacturer" required maxLength={160} defaultValue={product?.manufacturer} /></label>
        <label className="field">Registration reference <span className="optional">(optional)</span><input name="registrationNo" maxLength={80} defaultValue={product?.registrationNo ?? ''} /></label>
      </div>
      <label className="field">Description <span className="optional">(optional)</span><textarea name="description" maxLength={2000} rows={3} defaultValue={product?.description ?? ''} /></label>
      <StatusField status={product?.status} />
      <p className="field-hint">Use Inactive to retire a record or Suspicious to flag it for review. A registration reference is a stored reference, not proof of regulatory approval.</p>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="action-row"><button className="button" disabled={busy}>{busy ? 'Saving…' : product ? 'Save product' : 'Create product'}</button><button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>Back to products</button></div>
  </form>;
}
