import { useSearchParams } from 'react-router-dom';
import { PackageCheck, Link2, Camera } from 'lucide-react';
import SectionTabs, { SectionPanel } from '../../components/SectionTabs';
import OrgItems from './OrgItems';
import OrgChainOfCustody from './OrgChainOfCustody';
import OrgCCTV from './OrgCCTV';

/**
 * Operations — where the physical item is accounted for.
 *
 * Items, Chain of Custody and Last Seen & CCTV answer one question between them:
 * "do we know where this thing is, and can we prove it?" They were three sidebar
 * entries, which made a custody check look like a separate discipline from the
 * inventory it belongs to.
 */
const TABS = [
  { id: 'items', label: 'Inventory', icon: PackageCheck, hint: 'Items currently held' },
  { id: 'custody', label: 'Chain of Custody', icon: Link2, hint: 'Sealed handover ledger' },
  { id: 'last-seen', label: 'Last Seen & CCTV', icon: Camera, hint: 'Footage analysis for a case' }
];

export default function OrgOperations() {
  const [params] = useSearchParams();
  const tab = params.get('tab') || 'items';
  const active = TABS.some((t) => t.id === tab) ? tab : 'items';

  return (
    <div>
      <SectionTabs label="Operations" tabs={TABS} />
      <SectionPanel tab={active}>
        {active === 'items' && <OrgItems />}
        {active === 'custody' && <OrgChainOfCustody />}
        {active === 'last-seen' && <OrgCCTV />}
      </SectionPanel>
    </div>
  );
}
