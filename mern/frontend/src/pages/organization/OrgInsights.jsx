import { useSearchParams } from 'react-router-dom';
import { BarChart3, ClipboardList, Cpu } from 'lucide-react';
import SectionTabs, { SectionPanel } from '../../components/SectionTabs';
import OrgAnalytics from './OrgAnalytics';
import OrgAuditLogs from './OrgAuditLogs';
import AiModelInventory from '../../components/AiModelInventory';

/**
 * Insights — what actually happened, and what is actually running.
 *
 * Analytics and Audit Logs were separate entries. The third tab is new and
 * deliberate: a recovery platform that claims real AI must be able to show which
 * checkpoints are installed, on which device, at what dimension, and - on demand -
 * prove each one computes by running a real inference. That belongs next to the
 * numbers it explains, not buried in a log file.
 */
const TABS = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3, hint: 'Recovery trends and hotspots' },
  { id: 'audit', label: 'Audit Logs', icon: ClipboardList, hint: 'Who did what, when' },
  { id: 'models', label: 'AI Models', icon: Cpu, hint: 'Installed checkpoints and live verification' }
];

export default function OrgInsights() {
  const [params] = useSearchParams();
  const tab = params.get('tab') || 'analytics';
  const active = TABS.some((t) => t.id === tab) ? tab : 'analytics';

  return (
    <div>
      <SectionTabs label="Insights" tabs={TABS} />
      <SectionPanel tab={active}>
        {active === 'analytics' && <OrgAnalytics />}
        {active === 'audit' && <OrgAuditLogs />}
        {active === 'models' && <AiModelInventory />}
      </SectionPanel>
    </div>
  );
}
