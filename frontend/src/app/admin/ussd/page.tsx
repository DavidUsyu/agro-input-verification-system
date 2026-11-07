import { requireUser } from '@/lib/session';
import { UssdSimulator } from '@/components/ussd-simulator';

export default async function UssdPage() {
  await requireUser('administrator');
  return <main id="main" className="account-page"><div className="account-heading"><div><p className="eyebrow">Channel testing</p><h1>USSD simulator</h1><p>Try product verification and farmer account menus before connecting a live service.</p></div><span className="admin-context-label">Local simulator</span></div><UssdSimulator/></main>;
}
