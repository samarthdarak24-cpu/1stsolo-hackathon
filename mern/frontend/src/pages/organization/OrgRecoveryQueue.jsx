import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Sparkles } from 'lucide-react';
import SectionTabs, { SectionPanel } from '../../components/SectionTabs';
import OrgLostFound from './OrgLostFound';
import OrgAIMatching from './OrgAIMatching';

/**
 * Recovery Queue — everything a staff member works on, in one board.
 *
 * "Lost & Found" and "AI Matching" were two sidebar entries for two halves of the
 * same job: the report arrives, then the machine proposes candidates for it. A
 * reviewer was forced to bounce between them to answer one question - which cases
 * need me right now?
 *
 * Both panels are the existing pages, unchanged, so the per-candidate evidence,
 * review and decision actions keep working exactly as verified.
 */
const TABS = [
  { id: 'reports', label: 'Lost & Found', icon: ClipboardList, hint: 'Every report in this organization' },
  { id: 'matches', label: 'AI Matching', icon: Sparkles, hint: 'Candidate pairs the models proposed' }
];

export default function OrgRecoveryQueue() {
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'matches' ? 'matches' : 'reports';

  return (
    <div>
      <SectionTabs label="Recovery Queue" tabs={TABS} />
      <SectionPanel tab={tab}>
        {tab === 'matches' ? <OrgAIMatching /> : <OrgLostFound />}
      </SectionPanel>
    </div>
  );
}
