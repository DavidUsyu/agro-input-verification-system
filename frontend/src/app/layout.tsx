import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { accountPath } from '@/lib/auth-types';
import './globals.css';
import { SiteFrame } from '@/components/site-frame';
import { FarmerNavigation } from '@/components/farmer-navigation';

export const metadata: Metadata = {
  title: 'AgroVerify | Agro-Input Verification',
  description: 'A seed and fertilizer product-code verification project for smallholder farmers in Kenya.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <SiteFrame header={<header className={`site-header${user?.role==='farmer' ? ' farmer-header' : ''}`}>
          <Link className="brand" href={user?.role==='farmer' ? '/farmer' : '/'} aria-label="AgroVerify home">
            <span className="brand-mark" aria-hidden="true">AV</span>
            <span>AgroVerify<span className="brand-caption">Seeds &amp; fertilizers</span></span>
          </Link>
          {user?.role==='farmer' ? <FarmerNavigation /> : <nav className="account-nav" aria-label="Account"><Link href="/verify">Verify code</Link>{user ? <><Link href="/admin/products">Products</Link><Link href="/admin/verifications">History</Link><Link href="/admin/reports">Reports</Link><Link href={accountPath(user.role)}>Dashboard</Link></> : <><Link href="/login">Sign in</Link><Link href="/register" className="nav-register">Create account</Link></>}</nav>}
        </header>} footer={<footer className="site-footer">
          <span>Built for smallholder farmers in Kenya.</span>
          <Link href="/status">Service status <span aria-hidden="true">↗</span></Link>
        </footer>}>{children}</SiteFrame>
      </body>
    </html>
  );
}
