import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { ReportForm } from '@/components/report-form';

export default async function NewReportPage({ searchParams }: { searchParams:Promise<Record<string,string | string[] | undefined>> }) {
  await requireUser('farmer');
  const params = await searchParams;
  const code = typeof params.code==='string' ? params.code.slice(0,80) : '';
  const verificationId = typeof params.verificationId==='string' && /^[1-9]\d{0,18}$/.test(params.verificationId) ? params.verificationId : '';
  return <main id="main" className="account-page verify-page"><SessionWatch /><Link className="back-link" href="/farmer/reports">← My reports</Link><div className="account-heading"><div><p className="eyebrow">Seeds &amp; fertilizers</p><h1>Report a product concern</h1><p>Report a registered or unknown product, with or without a package code.</p></div></div><ReportForm code={code} verificationId={verificationId} /></main>;
}
