import { AccountPage } from '@/components/account-page';
import { requireUser } from '@/lib/session';

export default async function FarmerAccountPage() { return <AccountPage user={await requireUser('farmer')} />; }
