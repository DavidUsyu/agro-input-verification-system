'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function SiteFrame({ children, header, footer }: { children: ReactNode; header: ReactNode; footer: ReactNode }) {
  const pathname = usePathname();
  const administrator = pathname === '/admin' || pathname.startsWith('/admin/');
  return <>{!administrator && header}{children}{!administrator && footer}</>;
}
