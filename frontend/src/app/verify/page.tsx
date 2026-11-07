import { currentUser } from '@/lib/session';
import { VerificationForm } from '@/components/verification-form';
import Link from 'next/link';

export default async function VerifyPage() {
  const user = await currentUser().catch(() => null);
  return <main id="main" className="account-page farmer-page verify-page">{user?.role==='farmer' && <Link className="back-link" href="/farmer">← Farmer home</Link>}<div className="account-heading farmer-heading"><div><p className="eyebrow">Seeds &amp; fertilizers</p><h1>Verify a product</h1><p>Enter the package code, then compare the result with the label.</p></div></div><VerificationForm role={user?.role} /></main>;
}
