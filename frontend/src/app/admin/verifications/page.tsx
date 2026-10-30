import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { VerificationHistory } from '@/components/verification-history';

export default async function AdministratorHistoryPage({ searchParams }: { searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  await requireUser('administrator');
  const params=await searchParams; const q=typeof params.q==='string' ? params.q.slice(0,160) : '';
  return <main id="main" className="account-page"><SessionWatch /><Link className="back-link" href="/admin">← Dashboard</Link><div className="account-heading"><div><p className="eyebrow">Administrator workspace</p><h1>Verification records</h1><p>Review farmer, guest and administrator checks.</p></div></div><VerificationHistory key={q} administrator initialSearch={q} /></main>;
}
