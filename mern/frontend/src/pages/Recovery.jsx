import { ClipboardList, PackageCheck, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import SectionTabs, { SectionPanel } from '../components/SectionTabs';
import MyReports from './MyReports';
import TrackReturn from './TrackReturn';

/**
 * Recovery — the second half of the case lifecycle.
 *
 * DISCOVER happens on Report and Matches. VERIFY and RETURN both happen here,
 * because to the person involved they are one continuous question: "is this mine,
 * and how do I get it back?" Splitting them across "Ownership Verification",
 * "Track Return" and "QR" made people hunt for the next step of a single task.
 *
 * The panels are the existing, working pages. Nothing was rewritten to fit them
 * into tabs, so the verified verification and one-time-QR flows are untouched.
 */
const TABS = [
  { id: 'cases', label: 'My cases', icon: ClipboardList },
  { id: 'returns', label: 'Returns & QR', icon: PackageCheck }
];

export default function Recovery() {
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'returns' ? 'returns' : 'cases';

  return (
    <div>
      <SectionTabs
        label="Recovery"
        tabs={TABS}
        className="mb-5"
      />

      <SectionPanel tab={tab}>
        {tab === 'cases' ? <MyReports /> : <TrackReturn />}
      </SectionPanel>

      {/* Verification starts from a specific match, so it is reached from the
          case rather than listed here. Point at it explicitly instead of leaving
          a user who came looking for "verification" with nothing to click. */}
      <p className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
        Ownership verification is started from the match you want to claim.
        <Link to="/matches" className="font-bold text-brand-600 hover:text-brand-700">
          Open my matches
        </Link>
      </p>
    </div>
  );
}

