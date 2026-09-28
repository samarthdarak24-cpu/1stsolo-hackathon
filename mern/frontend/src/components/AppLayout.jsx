import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, PackagePlus, Sparkles, Bell, PackageCheck,
  Search, User, ShieldCheck
} from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorState from './ErrorState';
import { useOrganization } from '../context/OrganizationContext';
import { cn } from '../lib/cn';

/**
 * Mobile bottom navigation, per the mobile spec:
 *   Home · Search · Report · Matches · Profile
 *
 * Report sits in the middle and is RAISED, because it is the only one of the
 * five that creates something — it should be reachable by a thumb without
 * aiming. Profile replaces "Notifications" as the fifth slot: alerts already
 * have a badge on the topbar bell, whereas settings, organisations and sign-out
 * had no mobile entry point at all.
 */
const MEMBER_NAV = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/report', label: 'Report', icon: PackagePlus, primary: true },
  { to: '/matches', label: 'Matches', icon: Sparkles },
  { to: '/profile', label: 'Profile', icon: User }
];

/** The organization equivalent: the queues a staff member works from. */
const ORG_NAV = [
  { to: '/organization/overview', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/organization/recovery', label: 'Recovery', icon: PackageCheck },
  { to: '/organization/verification', label: 'Claims', icon: ShieldCheck, primary: true },
  { to: '/organization/operations', label: 'Operations', icon: PackageCheck },
  { to: '/profile', label: 'Profile', icon: User }
];

/**
 * AppLayout — the shared shell for every authenticated page.
 *
 * Desktop: fixed sidebar + content. Mobile: drawer sidebar + bottom navigation.
 *
 * The `variant` prop is what keeps the two portals genuinely separate: `user`
 * renders member navigation, `org` renders the organization queues. An
 * organization manager who lands on /organization/* therefore never sees member
 * pages in the sidebar, and a member never sees management screens.
 */
export default function AppLayout({ variant = 'user' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { hasOrganization, activeOrganization } = useOrganization();

  const isOrg = variant === 'org';
  // Every slot in both bars is reachable by every role in that portal, so no
  // filtering is needed - the two arrays ARE the role split.
  const bottomNav = isOrg ? ORG_NAV : MEMBER_NAV;

  if (!hasOrganization) {
    return (
      <div className="dot-pattern flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ErrorState
            variant="permission"
            title="No active organization"
            onRetry={() => window.location.reload()}
          />
          <p className="mt-4 text-center text-sm text-slate-500">
            Join or create an organization to start using LostLink AI.
          </p>
          <button
            type="button"
            onClick={() => navigate('/organizations/new')}
            className="mx-auto mt-4 block text-sm font-bold text-brand-600 hover:underline"
          >
            Create an organization →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-surface min-h-screen">
      {/* Fixed desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-slate-200/70 bg-white lg:block">
        <Sidebar variant={variant} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="absolute inset-y-0 left-0 w-72 border-r border-slate-200 bg-white shadow-pop"
            >
              <Sidebar variant={variant} onNavigate={() => setMenuOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-[260px]">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 lg:pb-14">
          {/* The page is keyed on the pathname so it fades in per route, but it
              is deliberately NOT wrapped in <AnimatePresence mode="wait">.
              Under React StrictMode that combination can leave the exiting child
              mounted forever, which renders a permanently blank content area
              while the sidebar and topbar keep working. A one-shot enter
              gives the same polish with no way to get stuck.

              The enter is a CSS animation rather than framer-motion for the
              same "no way to get stuck" reason: a JS-driven entrance only
              advances while animation frames run, so a deep link opened in a
              background tab would leave the entire page at `opacity: 0` until
              the tab was focused. CSS always finishes. */}
          <div key={location.pathname} className="animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl lg:hidden">
        <div className="pb-safe grid grid-cols-5">
          {bottomNav.map((item) => {
            const active = location.pathname === item.to
              || (!item.end && item.to !== '/profile' && location.pathname.startsWith(`${item.to}/`));
            const Icon = item.icon;

            if (item.primary) {
              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => { setMenuOpen(false); navigate(item.to); }}
                  className="relative flex flex-col items-center justify-end pb-1.5 text-[10px] font-bold text-brand-600"
                  aria-label={item.label}
                >
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition active:scale-95">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-1">{item.label}</span>
                </button>
              );
            }

            return (
              <button
                key={item.to}
                type="button"
                onClick={() => { setMenuOpen(false); navigate(item.to); }}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors',
                  active ? 'text-brand-600' : 'text-slate-400'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-nav-active"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand-500"
                  />
                )}
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
