import { cn } from '../lib/cn';
import { Stat } from './ui/Stat';
import { Skeleton } from './ui/Skeleton';

/**
 * StatCard — the metric tile used on every dashboard.
 *
 * This is now a thin adapter over the semantic `Stat` primitive. The legacy
 * `color` prop is still accepted so the pre-redesign pages keep working, but it
 * is MAPPED onto a meaning rather than used literally. That is what removes the
 * amber / violet / sky / rose / indigo rainbow: two dashboards can no longer
 * disagree about what colour a number deserves.
 *
 *   emerald -> positive    a good outcome (returned, resolved)
 *   amber   -> attention   waiting on a human
 *   rose    -> critical    overdue or failing
 *   violet  -> brand       a product-identity metric (AI matches)
 *   sky / indigo / slate -> neutral
 */
const TONE_FOR = {
  emerald: 'positive',
  green: 'positive',
  amber: 'attention',
  orange: 'attention',
  rose: 'critical',
  red: 'critical',
  violet: 'brand',
  purple: 'brand',
  teal: 'brand',
  sky: 'neutral',
  blue: 'neutral',
  indigo: 'neutral',
  slate: 'neutral'
};

export default function StatCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
  description,
  color = 'neutral',
  tone,
  loading = false,
  onClick,
  className = '',
  children
}) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl bg-white p-4 shadow-soft', className)}>
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-3 h-8 w-1/3" />
        <Skeleton className="mt-2.5 h-3 w-2/3" />
      </div>
    );
  }

  const hint = description
    || (typeof trend === 'number' && trendLabel ? `${trend > 0 ? '+' : ''}${trend} ${trendLabel}` : undefined);

  return (
    <Stat
      label={label}
      value={value}
      icon={icon}
      tone={tone || TONE_FOR[color] || 'neutral'}
      hint={hint}
      trend={trend}
      onClick={onClick}
      className={className}
    >
      {children}
    </Stat>
  );
}
