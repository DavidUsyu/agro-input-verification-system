import Link from 'next/link';
import { SessionWatch } from './session-watch';
import type { SessionUser } from '@/lib/auth-types';
import { UssdSettings } from './ussd-settings';

export function AccountPage({ user }: { user: SessionUser }) {
  return <main id="main" className="account-page farmer-page farmer-settings">
    <SessionWatch />
    <Link href="/farmer" className="back-link">← Farmer home</Link>
    <div className="account-heading farmer-heading"><div><p className="eyebrow">Your settings</p><h1>My account</h1><p>Your profile and access to personal USSD menus.</p></div></div>
    <section className="account-card" aria-labelledby="account-details"><h2 id="account-details">Your account</h2><dl className="service-list">
      <div><dt>Name</dt><dd>{user.fullName}</dd></div>
      {user.email && <div><dt>Email</dt><dd>{user.email}</dd></div>}
      {user.phone && <div><dt>Phone</dt><dd>{user.phone}</dd></div>}
      {user.county && <div><dt>Profile county</dt><dd>{user.county}</dd></div>}
    </dl></section>
    <UssdSettings />
  </main>;
}
