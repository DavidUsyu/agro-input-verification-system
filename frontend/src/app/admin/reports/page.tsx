import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { ReportHistory } from '@/components/report-history';
import { reportStatuses } from '@/lib/report-types';

export default async function AdminReportsPage({ searchParams }: { searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  await requireUser('administrator');
  const params=await searchParams;
  const q=typeof params.q==='string' ? params.q.slice(0,160) : '';
  const status=typeof params.status==='string' && Object.hasOwn(reportStatuses,params.status) ? params.status : '';
  return <main id="main" className="account-page"><SessionWatch /><Link className="back-link" href="/admin">← Dashboard</Link><div className="account-heading"><div><p className="eyebrow">Product concerns</p><h1>Review product reports</h1><p>Investigate submitted concerns and respond to farmers. Reports are observations awaiting review.</p></div></div><ReportHistory key={`${q}:${status}`} administrator initialSearch={q} initialStatus={status} /></main>;
}
