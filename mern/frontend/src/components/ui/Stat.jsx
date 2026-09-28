import { cn } from '../../lib/cn';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * Stat — a single metric.
 *
 * Tone is semantic, never decorative:
 *   neutral    a plain count
 *   positive   a good outcome (returned, resolved)
 *   attention  something waiting on a human
 *   critical   something overdue or failing
 *
 * The previous tile picked a colour per screen (amber / violet / sky / rose /
 * indigo), which is exactly the "generic dashboard template" look. Here the
 * colour is derived from what the number MEANS, so two dashboards agree.
 */
const TONES = {
  neutral: { value: 'text-brand-ink', icon: 'bg-slate-100 text-slate-500', spark: 'bg-slate-300' },
  positive: { value: 'text-brand-ink', icon: 'bg-emerald-50 text-emerald-600', spark: 'bg-emerald-500' },
  attention: { value: 'text-brand-ink', icon: 'bg-amber-50 text-amber-600', spark: 'bg-amber-500' },
  critical: { value: 'text-brand-ink', icon: 'bg-red-50 text-red-600', spark: 'bg-red-500' },
  brand: { value: 'text-brand-ink', icon: 'bg-brand-50 text-brand-600', spark: 'bg-brand-500' }
};

export function Stat({
  label,
  value,
  icon,
  tone = 'neutral',
  hint,
  trend,
  onClick,
  className,
  children
}) {
  const t = TONES[tone] || TONES.neutral;
  const Comp = onClick ? 'button' : 'div';
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  return (
    <Comp
      onClick={onClick}
      className={cn(
        'group relative flex w-full flex-col rounded-2xl bg-white p-4 text-left shadow-soft',
        onClick && 'transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:shadow-lift',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105', t.icon)}>
            {icon}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn('animate-count-in text-3xl font-extrabold leading-none tracking-tight tabular-nums', t.value)}>
          {value}
        </span>
        {trend !== undefined && trend !== null && (
          <span className={cn('flex items-center gap-0.5 text-xs font-bold',
            trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-slate-400')}>
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      {hint && <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-slate-500">{hint}</p>}
      {children}
    </Comp>
  );
}

export default Stat;
