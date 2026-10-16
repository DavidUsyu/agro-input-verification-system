import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { ProductManager } from '@/components/product-manager';
import { SessionWatch } from '@/components/session-watch';

export default async function ProductsPage() {
  await requireUser('administrator');
  return <main id="main" className="account-page products-page"><SessionWatch />
    <Link href="/admin" className="back-link">← Administrator account</Link>
    <div className="account-heading"><div><p className="eyebrow">Administrator workspace</p><h1>Product management</h1><p>Maintain product records and the codes used to identify them.</p></div></div>
    <ProductManager />
  </main>;
}
