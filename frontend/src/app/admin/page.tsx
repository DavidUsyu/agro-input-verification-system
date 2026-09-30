import { AccountPage } from '@/components/account-page';
import { requireUser } from '@/lib/session';

export default async function AdminPage() { return <AccountPage user={await requireUser('administrator')} />; }
