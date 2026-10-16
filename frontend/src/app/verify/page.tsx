import { currentUser } from '@/lib/session';
import { VerificationForm } from '@/components/verification-form';

export default async function VerifyPage() {
  const user = await currentUser().catch(() => null);
  return <main id="main" className="account-page verify-page"><div className="account-heading"><div><p className="eyebrow">Seeds &amp; fertilizers</p><h1>Check a product code</h1><p>Compare the details on the packaging with the stored product record.</p></div></div><VerificationForm role={user?.role} /></main>;
}
