import { requireUser } from '@/lib/session';
import { resultLabels } from '@/lib/verification-types';
import { VerificationHistory } from '@/components/verification-history';

export default async function AdministratorHistoryPage({ searchParams }: { searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  await requireUser('administrator');
  const params=await searchParams; const q=typeof params.q==='string' ? params.q.slice(0,160) : '';
  const result=typeof params.result==='string' && Object.hasOwn(resultLabels,params.result) ? params.result : '';
  return <main id="main" className="account-page"><div className="account-heading"><div><p className="eyebrow">Verification activity</p><h1>Verification records</h1><p>Review saved results and the evidence behind each product check.</p></div></div><VerificationHistory key={`${q}:${result}`} administrator initialSearch={q} initialResult={result} /></main>;
}
