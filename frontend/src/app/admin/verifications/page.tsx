import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { VerificationHistory } from '@/components/verification-history';

export default async function AdministratorHistoryPage() {
  await requireUser('administrator');
  return <main id="main" className="account-page"><SessionWatch /><Link className="back-link" href="/admin">← Administrator account</Link><div className="account-heading"><div><p className="eyebrow">Administrator workspace</p><h1>Verification records</h1><p>Review farmer, guest and administrator checks.</p></div></div><VerificationHistory administrator /></main>;
}
