import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Badge — semantic tones only.
 *
 * Colour here carries meaning (success / warning / error / info), never
 * decoration. The old revision accepted a free-form tone string, which is how
 * an `amber` badge ended up on a screen where amber meant nothing.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none',
  {
    variants: {
      tone: {
        neutral: 'bg-slate-100 text-slate-600',
        primary: 'bg-brand-50 text-brand-700',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        danger: 'bg-red-50 text-red-700',
        info: 'bg-accent-50 text-accent-700',
        solid: 'bg-brand-600 text-white'
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-1 text-[11px]'
      }
    },
    defaultVariants: { tone: 'neutral', size: 'md' }
  }
);

export const Badge = forwardRef(function Badge(
  { className, tone, size, dot = false, children, ...props }, ref
) {
  return (
    <span ref={ref} className={cn(badgeVariants({ tone, size, className }))} {...props}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
});
