import { requireUser } from '@/lib/session';
import { AdminReports } from '@/components/admin-reports';
import { reportStatuses } from '@/lib/report-types';

export default async function AdminReportsPage({ searchParams }: { searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  await requireUser('administrator');
  const params=await searchParams;
  const q=typeof params.q==='string' ? params.q.slice(0,160) : '';
  const status=typeof params.status==='string' && Object.hasOwn(reportStatuses,params.status) ? params.status : '';
  return <main id="main" className="account-page reports-page"><div className="account-heading"><div><p className="eyebrow">Product concerns</p><h1>Review product reports</h1><p>Investigate farmer concerns and keep a clear record of your response.</p></div></div><AdminReports key={`${q}:${status}`} initialSearch={q} initialStatus={status} /></main>;
}
