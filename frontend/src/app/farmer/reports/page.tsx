import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { ReportHistory } from '@/components/report-history';

export default async function FarmerReportsPage() {
  await requireUser('farmer');
  return <main id="main" className="account-page farmer-page"><SessionWatch /><Link className="back-link" href="/farmer">← Farmer home</Link><div className="account-heading farmer-heading"><div><p className="eyebrow">Your product concerns</p><h1>My reports</h1><p>Follow each report from submission to review and read the response.</p></div><Link className="button" href="/farmer/reports/new">Report a concern</Link></div><ReportHistory /></main>;
}
