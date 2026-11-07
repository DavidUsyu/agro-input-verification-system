import { requireUser } from '@/lib/session';
import { ProductManager } from '@/components/product-manager';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  await requireUser('administrator');
  const params=await searchParams;
  const product=typeof params.product==='string' && /^[1-9]\d{0,18}$/.test(params.product) ? params.product : '';
  return <main id="main" className="account-page products-page">
    <div className="account-heading"><div><p className="eyebrow">Catalogue</p><h1>Products &amp; codes</h1><p>Maintain product details, batches, and unique package codes.</p></div></div>
    <ProductManager key={product} initialProductId={product} />
  </main>;
}
