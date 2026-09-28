import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Progress — a 3px track that reports completion without shouting.
 *
 * Tone is semantic: `primary` for neutral progress, `success` when a bar means
 * "done well", `warning`/`danger` when it means "needs attention".
 */
const progressVariants = cva('w-full overflow-hidden rounded-full bg-slate-100', {
  variants: {
    size: {
      xs: 'h-1',
      sm: 'h-1.5',
      md: 'h-2'
    }
  },
  defaultVariants: { size: 'sm' }
});

const indicatorVariants = cva('h-full origin-left animate-bar-grow rounded-full transition-all duration-500 ease-spring', {
  variants: {
    tone: {
      primary: 'bg-brand-500',
      success: 'bg-emerald-500',
      warning: 'bg-amber-500',
      danger: 'bg-red-500',
      neutral: 'bg-slate-400'
    }
  },
  defaultVariants: { tone: 'primary' }
});

/**
 * `color` is kept as an alias of `tone` because the pre-redesign pages pass it;
 * the legacy value `default` maps onto `neutral`.
 */
export const Progress = forwardRef(function Progress(
  { className, tone, color, value = 0, size, ...props }, ref
) {
  const resolved = tone || (color === 'default' ? 'neutral' : color) || 'primary';
  const pct = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(progressVariants({ size, className }))}
      {...props}
    >
      <div className={cn(indicatorVariants({ tone: resolved }))} style={{ width: `${pct}%` }} />
    </div>
  );
});
