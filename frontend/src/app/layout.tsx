import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgroVerify | Agro-Input Verification',
  description: 'A seed and fertilizer product-code verification project for smallholder farmers in Kenya.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="AgroVerify home">
            <span className="brand-mark" aria-hidden="true">AV</span>
            <span>AgroVerify<span className="brand-caption">Seeds &amp; fertilizers</span></span>
          </Link>
          <span className="stage-label">Early development</span>
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
