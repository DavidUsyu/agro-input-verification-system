'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from './logout-button';

export const farmerIcons = {
  home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
  verify: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12l3 3 7-7',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',
  reports: 'M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0',
  account: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
};
export function FarmerIcon({ name }: { name: keyof typeof farmerIcons }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={farmerIcons[name]} /></svg>;
}
const links = [
  {href:'/farmer',label:'Home',icon:'home'}, {href:'/verify',label:'Verify',icon:'verify'},
  {href:'/farmer/history',label:'History',icon:'history'}, {href:'/farmer/reports',label:'Reports',icon:'reports'},
  {href:'/farmer/account',label:'Account',icon:'account'},
] as const;

export function FarmerNavigation() {
  const pathname=usePathname();
  const items=links.map(link=><Link key={link.href} href={link.href} aria-current={pathname===link.href || (link.href==='/farmer/reports' && pathname.startsWith(`${link.href}/`)) ? 'page' : undefined}><FarmerIcon name={link.icon}/><span>{link.label}</span></Link>);
  return <><div className="farmer-header-actions"><nav className="farmer-desktop-nav" aria-label="Farmer navigation">{items}</nav><LogoutButton /></div><nav className="farmer-mobile-nav" aria-label="Farmer mobile navigation">{items}</nav></>;
}
