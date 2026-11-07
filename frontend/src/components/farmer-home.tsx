import Link from 'next/link';
import type { SessionUser } from '@/lib/auth-types';
import { FarmerIcon } from './farmer-navigation';
import { SessionWatch } from './session-watch';
import { FarmerRecentActivity } from './farmer-recent-activity';

export function FarmerHome({ user }: { user: SessionUser }) {
  return <main id="main" className="account-page farmer-page farmer-home">
    <SessionWatch />
    <div className="account-heading farmer-heading"><div><p className="eyebrow">Your farmer home</p><h1>Welcome, {user.fullName}.</h1><p>Check your inputs. Keep track of your concerns.</p></div><Link className="farmer-account-link" href="/farmer/account"><FarmerIcon name="account"/>Account &amp; USSD settings</Link></div>
    <section className="farmer-verify-banner" aria-labelledby="farmer-verify-heading"><div><p className="eyebrow">Before you buy or use</p><h2 id="farmer-verify-heading">Start with the package code.</h2><p>Check a seed or fertilizer record, its expiry date and any flagged concerns.</p><Link className="button" href="/verify"><FarmerIcon name="verify"/>Verify a product<span aria-hidden="true">→</span></Link></div><div className="package-illustration" aria-hidden="true"><svg viewBox="0 0 180 180" fill="none"><path d="M46 40h88l10 112H36L46 40Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2"/><path d="M46 40v-9h88v9M62 58h56M62 130h56M76 146h28M90 115V77m0 20c-17 0-22-10-22-18 14 0 22 5 22 18Zm0-7c17 0 22-10 22-18-14 0-22 5-22 18Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><rect x="116" y="112" width="44" height="44" rx="22" fill="#e9edce"/><path d="m128 134 8 8 13-17" stroke="#204f38" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div></section>
    <div className="farmer-action-grid">
      <Link href="/farmer/reports/new" className="farmer-action-card"><span className="farmer-action-icon"><FarmerIcon name="reports"/></span><h2>Report a concern</h2><p>Something wrong with a package or label? Tell us what you noticed.</p><span className="farmer-action-caption">Create a report <span aria-hidden="true">→</span></span></Link>
      <Link href="/farmer/history" className="farmer-action-card"><span className="farmer-action-icon"><FarmerIcon name="history"/></span><h2>My verification history</h2><p>Find your previous results and the product details saved with each check.</p><span className="farmer-action-caption">View my checks <span aria-hidden="true">→</span></span></Link>
      <Link href="/farmer/reports" className="farmer-action-card"><span className="farmer-action-icon"><FarmerIcon name="reports"/></span><h2>My reports</h2><p>Follow the review of your concerns and read the administrator’s response.</p><span className="farmer-action-caption">Track my reports <span aria-hidden="true">→</span></span></Link>
    </div>
    <FarmerRecentActivity />
  </main>;
}
