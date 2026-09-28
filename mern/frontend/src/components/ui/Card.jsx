import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Card — the base surface.
 *
 * A resting card is white + soft shadow and carries NO border. Elevation and
 * whitespace do the separation work; borders are reserved for inputs, hover
 * rings and real dividers.
 */
const cardVariants = cva('relative rounded-2xl bg-white shadow-soft', {
  variants: {
    padding: {
      none: '',
      sm: 'p-3.5',
      md: 'p-4',
      lg: 'p-5 sm:p-6'
    },
    tone: {
      plain: '',
      /** `interactive` lifts on hover. Use for anything clickable. */
      interactive:
        'transition-all duration-200 ease-spring hover:-translate-y-0.5 '
        + 'hover:shadow-lift hover:ring-1 hover:ring-slate-900/5 '
        + 'focus-within:-translate-y-0.5 focus-within:shadow-lift',
      outline: 'bg-transparent shadow-none ring-1 ring-dashed ring-slate-300'
    }
  },
  defaultVariants: { padding: 'lg', tone: 'plain' }
});

export const Card = forwardRef(function Card(
  { className, padding, tone, children, ...props }, ref
) {
  return (
    <div ref={ref} className={cn(cardVariants({ padding, tone, className }))} {...props}>
      {children}
    </div>
  );
});

/**
 * Section — a titled block inside a Card.
 *
 * Centralises the "heading + optional action + optional count" pattern so panel
 * headings align across every screen instead of drifting page by page. The old
 * `CardHeader`/`CardTitle` pair is kept as an alias.
 */
export function Section({
  title,
  hint,
  icon: Icon,
  action,
  actionLabel,
  onAction,
  to,
  count,
  className,
  children
}) {
  const Action = to ? 'a' : 'button';

  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-bold text-brand-ink">{title}</h2>
            {count !== undefined && count !== null && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">
                {count}
              </span>
            )}
          </div>
          {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
        </div>
      </div>

      {action || (actionLabel && onAction) ? (
        <div className="shrink-0">{action || (
          <Action
            {...(to ? { href: to } : { type: 'button', onClick: onAction })}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 transition hover:text-brand-700"
          >
            {actionLabel} <ChevronRight className="h-3.5 w-3.5" />
          </Action>
        )}</div>
      ) : null}
    </div>
  );
}

/** Kept for the pre-redesign call sites. */
export function CardHeader({ className, children, action }) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardTitle({ className, children, icon: Icon, hint }) {
  return (
    <div className="flex items-center gap-2.5">
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <h2 className={cn('truncate text-sm font-bold text-brand-ink', className)}>{children}</h2>
        {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
