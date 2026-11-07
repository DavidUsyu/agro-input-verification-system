import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { VerificationHistory } from '@/components/verification-history';

export default async function FarmerHistoryPage() {
  await requireUser('farmer');
  return <main id="main" className="account-page farmer-page"><SessionWatch /><Link className="back-link" href="/farmer">← Farmer home</Link><div className="account-heading farmer-heading"><div><p className="eyebrow">Your product checks</p><h1>Verification history</h1><p>Find a past result or report a concern about a product you checked.</p></div><Link className="button" href="/verify">Verify a product</Link></div><VerificationHistory /></main>;
}
