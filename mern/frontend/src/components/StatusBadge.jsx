import { cn } from '../lib/cn';
import { statusTone, statusLabel } from '../lib/format';

/**
 * StatusBadge — a domain status rendered as a quiet pill.
 *
 * The tone is derived from the status (see lib/format), so a status can never be
 * given an arbitrary colour at the call site. `violet` and `info` are retained
 * because older call sites pass them explicitly.
 */
const TONES = {
  default: 'bg-slate-100 text-slate-600',
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700',
  primary: 'bg-brand-50 text-brand-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-accent-50 text-accent-700',
  violet: 'bg-brand-50 text-brand-700'
};

export function StatusBadge({ status, label, tone, className, icon: Icon, dot = true }) {
  const resolved = tone || statusTone(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none',
        TONES[resolved] || TONES.default,
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {Icon && <Icon className="h-3 w-3" />}
      {label || statusLabel(status)}
    </span>
  );
}

export default StatusBadge;
