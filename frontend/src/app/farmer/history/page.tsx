import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { VerificationHistory } from '@/components/verification-history';

export default async function FarmerHistoryPage() {
  await requireUser('farmer');
  return <main id="main" className="account-page"><SessionWatch /><Link className="back-link" href="/farmer">← My account</Link><div className="account-heading"><div><p className="eyebrow">Your product checks</p><h1>Verification history</h1><p>Review the checks saved to your farmer account.</p></div><Link className="button" href="/verify">Check another code</Link></div><VerificationHistory /></main>;
}
