import { LogoutButton } from './logout-button';
import Link from 'next/link';
import { SessionWatch } from './session-watch';
import type { SessionUser } from '@/lib/auth-types';

export function AccountPage({ user }: { user: SessionUser }) {
  const admin = user.role === 'administrator';
  return <main id="main" className="account-page">
    <SessionWatch />
    <div className="account-heading"><div><p className="eyebrow">{admin ? 'Administrator area' : 'Farmer account'}</p><h1>Welcome, {user.fullName}.</h1><p>You are signed in to your {admin ? 'administrator' : 'farmer'} account.</p></div><LogoutButton /></div>
    <section className="account-card" aria-labelledby="account-details"><h2 id="account-details">Your account</h2><dl className="service-list">
      <div><dt>Role</dt><dd>{admin ? 'Administrator' : 'Farmer'}</dd></div>
      {user.email && <div><dt>Email</dt><dd>{user.email}</dd></div>}
      {user.phone && <div><dt>Phone</dt><dd>{user.phone}</dd></div>}
      {user.county && <div><dt>County</dt><dd>{user.county}</dd></div>}
    </dl></section>
    {admin ? <section className="account-card"><p className="eyebrow">Product catalogue</p><h2>Manage products and codes</h2><p>Add seeds and fertilizers, update their details, and manage batch information and verification codes.</p><Link className="button" href="/admin/products">Manage products</Link></section>
      : <section className="account-card"><p className="eyebrow">Your product checks</p><h2>Check products and keep your history</h2><p>Check a seed or fertilizer code against stored records and review your previous results.</p><div className="action-row"><Link className="button" href="/verify">Verify a code</Link><Link className="button button-secondary" href="/farmer/history">My verification history</Link></div></section>}
    {admin && <section className="account-card"><p className="eyebrow">Verification activity</p><h2>Review verification records</h2><p>View checks from farmers, guests and administrators, including the result and saved product details.</p><Link className="button" href="/admin/verifications">View verification records</Link></section>}
  </main>;
}
