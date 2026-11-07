import Link from 'next/link';
import { AdminDashboard } from '@/components/admin-dashboard';
import { requireUser } from '@/lib/session';

export default async function AdminPage() {
  const user=await requireUser('administrator');
  return <main id="main" className="account-page dashboard-page">
    <div className="account-heading"><div><p className="eyebrow">Overview</p><h1>System dashboard</h1><p>Welcome, {user.fullName}. Here is your verification and reporting activity.</p></div><Link className="button" href="/admin/reports?status=submitted">Review new reports <span aria-hidden="true">→</span></Link></div>
    <AdminDashboard />
  </main>;
}
