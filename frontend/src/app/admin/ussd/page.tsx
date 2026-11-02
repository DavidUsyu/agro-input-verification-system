import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { SessionWatch } from '@/components/session-watch';
import { UssdSimulator } from '@/components/ussd-simulator';

export default async function UssdPage() {
  await requireUser('administrator');
  return <main id="main" className="account-page"><SessionWatch/><p className="eyebrow">Administrator tools</p><h1>USSD simulator</h1><p>Test verification, farmer account access, and reporting before connecting a live service.</p><p><Link href="/admin">Back to dashboard</Link></p><UssdSimulator/></main>;
}
