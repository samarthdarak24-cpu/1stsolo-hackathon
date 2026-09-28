import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, PackagePlus, Sparkles,
  PackageCheck, LogOut, ShieldCheck, BarChart3, Users, Search, ClipboardList
} from 'lucide-react';
import { cn } from '../lib/cn';
import Logo from './Logo';
import OrgMark from './OrgMark';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';

/**
 * Left navigation for the MEMBER portal.
 *
 * Exactly five destinations, in the order a case moves through the product:
 *   Home    what needs me now
 *   Search  look for the item
 *   Report  file it
 *   Matches read the AI candidates
 *   Recover get it back (verification, pickup code, returns)
 *
 * Everything else — profile, settings, organisations, notifications, a single
 * report — is context on one of these five, so it is not a destination. Alerts
 * stay in the topbar bell, which is visible at every breakpoint and carries the
 * unread badge.
 */
const USER_NAV = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/report', label: 'Report', icon: PackagePlus },
  { to: '/matches', label: 'Matches', icon: Sparkles },
  { to: '/recovery', label: 'Recovery', icon: PackageCheck }
];

/**
 * Organization navigation.
 *
 * Six destinations around the question the organization actually asks: "which
 * recovery cases need action?". Reports and AI matching share Recovery, physical
 * custody lives in Operations, and the numbers plus the audit trail live in
 * Insights.
 */
const ORG_NAV = [
  { to: '/organization/overview', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/organization/recovery', label: 'Recovery', icon: ClipboardList },
  { to: '/organization/verification', label: 'Claims', icon: ShieldCheck },
  { to: '/organization/operations', label: 'Operations', icon: PackageCheck },
  { to: '/organization/insights', label: 'Insights', icon: BarChart3 },
  { to: '/organization/people', label: 'People', icon: Users }
];

export default function Sidebar({ variant = 'user', onNavigate }) {
  const { logout, isOrgAdmin } = useAuth();
  const { activeOrganization, role } = useOrganization();
  const navigate = useNavigate();
  const isOrg = variant === 'org';

  // The organization bar deliberately shows all six destinations to every staff
  // role: it is the map of the product. Access is decided by the route guard
  // (Insights and People are manager-only on the API), not by hiding the door.
  const items = isOrg ? ORG_NAV : USER_NAV;

  const renderItem = (item) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={Boolean(item.end)}
        onClick={onNavigate}
        className={({ isActive }) => cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
          isActive ? 'text-brand-700' : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-900'
        )}
      >
        {({ isActive }) => (
          <>
            {/* One shared element slides between items instead of each link
                painting its own highlight, so the transition reads as motion. */}
            {isActive && (
              <motion.span
                layoutId={`sidebar-active-${variant}`}
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                className="absolute inset-0 -z-10 rounded-xl bg-brand-50"
              />
            )}
            <Icon className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
            )} />
            <span className="flex-1 truncate">{item.label}</span>
          </>
        )}
      </NavLink>
    );
  };

  return (
    // The sidebar is a QUIET frame: one identity block, then pure navigation.
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-5">
        {isOrg ? (
          <OrgMark organization={activeOrganization} size="md" />
        ) : (
          <Logo size="sm" wordmark={false} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight tracking-tight text-brand-ink">
            {isOrg ? activeOrganization?.name || 'Organization' : 'LostLink AI'}
          </p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {isOrg ? role || 'Organization' : 'Personal'}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pt-2 pb-4 scrollbar-thin">
        {items.map(renderItem)}
      </nav>

      {/* An organization manager is also a person who can lose their own keys.
          Without this they would have to sign out to reach their own reports.
          Routed through the router rather than window.location.hash, which used
          to force a full page reload. */}
      {isOrg && isOrgAdmin && (
        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={() => { navigate('/dashboard'); onNavigate?.(); }}
            title="Open your personal dashboard"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
          >
            <Search className="h-[18px] w-[18px] text-slate-400" />
            My personal items
          </button>
        </div>
      )}

      <div className="border-t border-slate-100 p-3">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px] text-slate-400" />
          Sign out
        </button>
      </div>
    </div>
  );
}
