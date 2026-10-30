import Link from 'next/link';
import { AdminDashboard } from '@/components/admin-dashboard';
import { LogoutButton } from '@/components/logout-button';
import { SessionWatch } from '@/components/session-watch';
import { requireUser } from '@/lib/session';

export default async function AdminPage() {
  const user=await requireUser('administrator');
  return <main id="main" className="account-page dashboard-page"><SessionWatch />
    <div className="account-heading"><div><p className="eyebrow">Administrator workspace</p><h1>System dashboard</h1><p>Welcome, {user.fullName}. Monitor product checks and reported concerns.</p></div><LogoutButton /></div>
    <nav className="action-row dashboard-actions" aria-label="Administrator tools"><Link className="button" href="/admin/products">Manage products</Link><Link className="button button-secondary" href="/admin/verifications">View verification records</Link><Link className="button button-secondary" href="/admin/reports">Review product reports</Link></nav>
    <AdminDashboard />
    <details className="account-card dashboard-account"><summary>Your account</summary><dl className="service-list"><div><dt>Name</dt><dd>{user.fullName}</dd></div><div><dt>Role</dt><dd>Administrator</dd></div>{user.email && <div><dt>Email</dt><dd>{user.email}</dd></div>}{user.phone && <div><dt>Phone</dt><dd>{user.phone}</dd></div>}</dl></details>
  </main>;
}
