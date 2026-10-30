import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { ReportHistory } from '@/components/report-history';

export default async function FarmerReportsPage() {
  await requireUser('farmer');
  return <main id="main" className="account-page"><SessionWatch /><Link className="back-link" href="/farmer">← My account</Link><div className="account-heading"><div><p className="eyebrow">Your concerns</p><h1>My reports</h1><p>Follow the progress of your submitted product concerns and read administrator responses.</p></div><Link className="button" href="/farmer/reports/new">Report a product</Link></div><ReportHistory /></main>;
}
