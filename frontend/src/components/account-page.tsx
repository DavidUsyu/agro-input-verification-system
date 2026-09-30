import { LogoutButton } from './logout-button';
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
    <section className="account-card upcoming"><p className="eyebrow">Coming next</p><h2>{admin ? 'Manage product records' : 'Check products and keep your history'}</h2><p>{admin ? 'The next milestone will let you add seeds, fertilizers and their product codes.' : 'Product verification and your verification history will be added in the next milestone.'}</p></section>
  </main>;
}
