import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { ReportForm } from '@/components/report-form';
import type { CatalogueProduct } from '@/lib/report-types';

export default async function NewReportPage({ searchParams }: { searchParams:Promise<Record<string,string | string[] | undefined>> }) {
  await requireUser('farmer');
  const params = await searchParams;
  const code = typeof params.code==='string' ? params.code.slice(0,80) : '';
  const verificationId = typeof params.verificationId==='string' && /^[1-9]\d{0,18}$/.test(params.verificationId) ? params.verificationId : '';
  const productName=typeof params.productName==='string' ? params.productName.slice(0,160) : '';
  const category=params.category==='fertilizer' ? 'fertilizer' : 'seed';
  // URL values are form suggestions only; the API validates ownership and uses authoritative catalogue details on submission.
  const initialProduct:CatalogueProduct | undefined=typeof params.productId==='string' && /^[1-9]\d{0,18}$/.test(params.productId) && productName
    ? {id:params.productId,name:productName,category,manufacturer:''} : undefined;
  return <main id="main" className="account-page farmer-page report-page"><SessionWatch /><Link className="back-link" href="/farmer/reports">← My reports</Link><div className="account-heading farmer-heading"><div><p className="eyebrow">Something doesn’t look right?</p><h1>Report a product concern</h1><p>Tell us what you noticed. You can report a product even if it has no code.</p></div></div><ReportForm code={code} verificationId={verificationId} initialProduct={initialProduct} initialName={productName} initialCategory={category} /></main>;
}
