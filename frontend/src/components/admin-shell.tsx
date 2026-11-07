'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LogoutButton } from './logout-button';
import { SessionWatch } from './session-watch';

const sections = [
  { href: '/admin', label: 'Dashboard', caption: 'Overview', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { href: '/admin/products', label: 'Products & codes', caption: 'Product management', icon: 'm3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10' },
  { href: '/admin/verifications', label: 'Verifications', caption: 'Verification records', icon: 'M9 3H5v18h14V3h-4M9 3v3h6V3H9Zm-1 10 3 3 5-6' },
  { href: '/admin/reports', label: 'Product reports', caption: 'Report review', icon: 'M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0' },
  { href: '/admin/ussd', label: 'USSD testing', caption: 'USSD simulator', icon: 'M7 2h10v20H7V2Zm3 3h4m-3 14h2' },
];

export function AdminShell({ children, name }: { children: ReactNode; name: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const current = sections.find(section => section.href === pathname) ?? sections[0];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('');
  return <div className="admin-shell" data-navigation-open={open} onKeyDown={event => {
    if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); }
  }}>
    <SessionWatch />
    <header className="admin-topbar">
      <div className="admin-location"><button ref={toggle} type="button" className="admin-menu-toggle" aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(!open)}>{open ? 'Close menu' : 'Menu'}</button><span>Workspace <span aria-hidden="true">/</span> <strong>{current.caption}</strong></span></div>
      <div className="admin-topbar-account"><span className="admin-avatar" aria-hidden="true">{initials}</span><span className="admin-account-name">{name}</span><LogoutButton /></div>
    </header>
    <aside className="admin-sidebar" id="admin-sidebar" aria-label="Administrator workspace">
      <Link href="/admin" className="brand admin-brand" aria-label="AgroVerify dashboard" onClick={() => setOpen(false)}><span className="brand-mark">AV</span><span>AgroVerify<span className="brand-caption">Administrator workspace</span></span></Link>
      <p className="admin-nav-label">Workspace</p>
      <nav aria-label="Administrator navigation">{sections.map(section => <Link key={section.href} href={section.href} aria-current={section.href === pathname ? 'page' : undefined} onClick={() => setOpen(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={section.icon}/></svg><span>{section.label}</span></Link>)}</nav>
      <div className="admin-sidebar-footer"><p className="admin-nav-label">Quick access</p><Link href="/verify" onClick={() => setOpen(false)}>Verify a package <span aria-hidden="true">↗</span></Link><Link href="/" onClick={() => setOpen(false)}>Public website <span aria-hidden="true">↗</span></Link><p>Seed and fertilizer verification<br/>for Kenyan farmers.</p></div>
    </aside>
    <div className="admin-workspace">{children}<footer className="admin-footer"><span>AgroVerify · Administrator workspace</span><Link href="/status">Service status</Link></footer></div>
  </div>;
}
