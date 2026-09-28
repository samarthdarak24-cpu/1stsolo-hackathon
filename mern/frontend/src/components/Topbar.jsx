import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, Menu, User, LogOut, Settings, ChevronRight, Building2, Plus, Search, CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useUnreadCount, useNotifications, useMarkNotificationRead } from '../lib/queries';
import { useLiveEvents } from '../lib/useLiveEvents';
import { initialsOf, relativeTime } from '../lib/format';
import GlobalSearchBar from './SearchBar';
import OrganizationSelector from './OrganizationSelector';
import OrgMark from './OrgMark';
import NotificationItem from './NotificationItem';
import { useToast } from './Toast';
import { cn } from '../lib/cn';

/**
 * Event types worth a toast. These are only ever published WITH a target user,
 * so nobody ever sees another member's alert.
 */
const TOASTABLE_EVENTS = new Set([
  'NEW_MATCH', 'RETURN_READY', 'ITEM_RETURNED', 'VERIFICATION_REQUIRED', 'SYSTEM'
]);

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { activeOrganizationId } = useOrganization();
  const { data: summary } = useUnreadCount(activeOrganizationId);
  const { data } = useNotifications(activeOrganizationId, { limit: 5 });
  const markRead = useMarkNotificationRead(activeOrganizationId);
  const unread = summary?.unread || 0;

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const items = data?.notifications || [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,360px)] overflow-hidden rounded-2xl bg-white shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-bold text-brand-ink">Notifications</p>
              {unread > 0 && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                  {unread} unread
                </span>
              )}
            </div>
            <div className="max-h-80 space-y-1.5 overflow-y-auto p-2.5 scrollbar-thin">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">You're all caught up.</p>
              ) : items.map((n, i) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={() => markRead.mutate(n.id)}
                  index={i}
                  className="p-3"
                />
              ))}
            </div>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 border-t border-slate-100 py-3 text-xs font-bold text-brand-600 transition hover:bg-brand-50"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activeOrganization, organizations, switchOrganization } = useOrganization();
  const to = (path) => { setOpen(false); navigate(path); };

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-slate-100 sm:pr-2.5"
        aria-label="Account menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
          {initialsOf(user?.name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-[13px] font-bold leading-tight text-slate-800">
            {user?.name}
          </span>
          <span className="block max-w-[140px] truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {activeOrganization?.name || 'No organization'}
          </span>
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16 }}
            className="stagger-fast absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-2xl bg-white shadow-pop"
          >
            <div className="border-b border-slate-100 px-4 py-3.5">
              <p className="truncate text-sm font-bold text-brand-ink">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>

            {/* Organisation switching lives with the identity, not in the
                recovery navigation — it is an account concern. */}
            {organizations.length > 0 && (
              <div className="border-b border-slate-100 p-2">
                <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Organizations
                </p>
                {organizations.map((org) => {
                  const active = org.id === activeOrganization?.id;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => { setOpen(false); if (!active) switchOrganization(org.id); }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50',
                        active && 'bg-brand-50/70'
                      )}
                    >
                      <OrgMark organization={org} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-800">{org.name}</span>
                        <span className="block truncate text-[11px] capitalize text-slate-400">{org.role}</span>
                      </span>
                      {active && <CheckCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => to('/organizations/new')}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-brand-200">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                  Create organization
                </button>
              </div>
            )}

            <button type="button" onClick={() => to('/profile')} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50">
              <User className="h-4 w-4" /> Profile
            </button>
            <button type="button" onClick={() => to('/settings')} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50">
              <Settings className="h-4 w-4" /> Settings
            </button>
            {activeOrganization && (
              <button
                type="button"
                onClick={() => to('/profile?section=organizations')}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                <Building2 className="h-4 w-4" /> Organization details
              </button>
            )}
            <button type="button" onClick={logout} className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Topbar — a compact command strip: menu, organization, one search field, live
 * state, alerts, account.
 *
 * Deliberately one row. The previous revision stacked a second row for the
 * organization selector on mobile, which pushed the page content down for no
 * benefit; the selector is reachable from the account menu instead.
 */
export default function Topbar({ onOpenMenu }) {
  const { activeOrganizationId } = useOrganization();
  const { connected, lastEvent } = useLiveEvents(activeOrganizationId);
  const toast = useToast();
  const lastToastKey = useRef(null);

  // Surface user-addressed events the moment they land — a new match, a ready
  // pickup, a completed handover — instead of making people watch the bell.
  // The key guard means a re-render can never re-fire the same toast.
  useEffect(() => {
    if (!lastEvent || !TOASTABLE_EVENTS.has(lastEvent.type)) return;
    const payload = lastEvent.data?.payload || {};
    const message = payload.message || payload.title;
    if (!message) return;
    const key = `${lastEvent.type}:${payload.id || payload.referenceId || message}`;
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;
    toast.info(message);
  }, [lastEvent, toast]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2.5 px-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <OrganizationSelector className="hidden w-52 shrink-0 lg:block" />

        <GlobalSearchBar className="min-w-0 flex-1" />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          {/* Realtime state. A tooltip carries the detail; the pill itself stays
              tiny so it never competes with the search field. */}
          <span
            className={cn(
              'hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:flex',
              connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            )}
            title={connected ? 'Live updates connected' : 'Connecting to live updates…'}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'animate-pulse bg-emerald-500' : 'bg-slate-400')} />
            {connected ? 'Live' : 'Offline'}
          </span>
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
