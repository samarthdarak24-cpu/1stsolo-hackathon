import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, ShieldCheck, PackageCheck, CircleCheck, FileText, Building2, Bell
} from 'lucide-react';
import { cn } from '../lib/cn';
import { relativeTime, NOTIFICATION_TONE, formatDateTime } from '../lib/format';
import { EASE_OUT } from './ui/Motion';

const ICONS = {
  NEW_MATCH: Sparkles,
  VERIFICATION_REQUIRED: ShieldCheck,
  VERIFICATION_RESULT: ShieldCheck,
  RETURN_READY: PackageCheck,
  ITEM_RETURNED: CircleCheck,
  REPORT_UPDATE: FileText,
  ORGANIZATION: Building2,
  SYSTEM: Bell
};

const TONES = {
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  sky: 'bg-sky-50 text-sky-600',
  slate: 'bg-slate-100 text-slate-500'
};

const ACTION_FOR = {
  NEW_MATCH: (n) => ({ label: 'Review match', to: `/matches/${n.referenceId}` }),
  VERIFICATION_REQUIRED: (n) => ({ label: 'Verify now', to: `/matches/${n.meta?.matchId || n.referenceId}/verify` }),
  VERIFICATION_RESULT: () => null,
  RETURN_READY: (n) => ({ label: 'View return', to: '/recovery?tab=returns' }),
  ITEM_RETURNED: (n) => ({ label: 'View report', to: `/recovery/${n.referenceId}` }),
  REPORT_UPDATE: (n) => ({ label: 'View report', to: `/recovery/${n.referenceId}` }),
  ORGANIZATION: () => null,
  SYSTEM: () => null
};

/* * One notification row. Unread rows get a tinted background + accent border + dot.
 *
 * `index` sequences a feed: the row fades up 35ms after the one above it, which
 * is what turns a batch of rows into a feed arriving rather than a block
 * appearing. It is capped so the twentieth row is not still waiting behind the
 * first. Used by the notification page and the topbar bell alike, so the two
 * feeds move identically. */
export default function NotificationItem({ notification, onRead, showAction = true, index, className }) {
  const Icon = ICONS[notification.type] || Bell;
  const tone = TONES[NOTIFICATION_TONE[notification.type]] || TONES.slate;
  const action = showAction ? ACTION_FOR[notification.type]?.(notification) : null;
  const unread = !notification.read;
  const delay = Number.isFinite(index) ? Math.min(index, 8) * 0.035 : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.26, ease: EASE_OUT, delay }}
      className={cn(
        'group relative flex items-start gap-4 rounded-xl border p-4 transition',
        unread
          ? 'border-brand-200 bg-brand-50/50 hover:bg-brand-50'
          : 'border-slate-200 bg-white hover:border-slate-300',
        className
      )}
      onClick={unread ? onRead : undefined}
    >
      {unread && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand-500" aria-label="Unread" />}

      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm', unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700')}>
            {notification.title}
          </p>
          {notification.meta?.finalScore != null && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              {notification.meta.finalScore}% match
            </span>
          )}
        </div>
        {notification.message && (
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{notification.message}</p>
        )}
        <p className="mt-1.5 text-xs text-slate-400" title={formatDateTime(notification.createdAt)}>
          {relativeTime(notification.createdAt)}
        </p>
      </div>

      {action && (
        <Link
          to={action.to}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0 self-center rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50"
        >
          {action.label} →
        </Link>
      )}
    </motion.div>
  );
}
