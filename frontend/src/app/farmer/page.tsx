import { FarmerHome } from '@/components/farmer-home';
import { requireUser } from '@/lib/session';

export default async function FarmerPage() { return <FarmerHome user={await requireUser('farmer')} />; }
