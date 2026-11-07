import { requireUser } from '@/lib/session';
import { AdminShell } from '@/components/admin-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('administrator');
  return <AdminShell name={user.fullName}>{children}</AdminShell>;
}
