import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { accountPath } from '@/lib/auth-types';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgroVerify | Agro-Input Verification',
  description: 'A seed and fertilizer product-code verification project for smallholder farmers in Kenya.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="AgroVerify home">
            <span className="brand-mark" aria-hidden="true">AV</span>
            <span>AgroVerify<span className="brand-caption">Seeds &amp; fertilizers</span></span>
          </Link>
          <nav className="account-nav" aria-label="Account">{user ? <Link href={accountPath(user.role)}>My account</Link> : <><Link href="/login">Sign in</Link><Link href="/register" className="nav-register">Create account</Link></>}</nav>
        </header>
        {children}
        <footer className="site-footer">
          <span>Built for smallholder farmers in Kenya.</span>
          <Link href="/status">Development service status <span aria-hidden="true">↗</span></Link>
        </footer>
      </body>
    </html>
  );
}
