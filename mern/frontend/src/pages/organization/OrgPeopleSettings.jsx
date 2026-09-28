import { useSearchParams } from 'react-router-dom';
import { Users, Settings } from 'lucide-react';
import SectionTabs, { SectionPanel } from '../../components/SectionTabs';
import OrgUsers from './OrgUsers';
import OrgSettings from './OrgSettings';

/**
 * People & Settings — who is in this organization, and how it is configured.
 *
 * Membership and configuration were two menu entries an admin visits rarely; both
 * are administration of the same tenant, so they share one destination.
 */
const TABS = [
  { id: 'people', label: 'People', icon: Users, hint: 'Members and their roles' },
  { id: 'settings', label: 'Settings', icon: Settings, hint: 'Organization profile and policy' }
];

export default function OrgPeopleSettings() {
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'settings' ? 'settings' : 'people';

  return (
    <div>
      <SectionTabs label="Administration" tabs={TABS} />
      <SectionPanel tab={tab}>
        {tab === 'settings' ? <OrgSettings /> : <OrgUsers />}
      </SectionPanel>
    </div>
  );
}
