import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold '
  + 'transition-all duration-150 ease-spring active:scale-[.98] '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 '
  + 'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Solid teal, no gradient. v1's gradient read as decorative; a flat
        // deep accent with a coloured shadow reads as product. The active
        // press is the darker end of the same ramp.
        primary:
          'bg-brand-600 text-white shadow-md shadow-brand-600/25 '
          + 'hover:bg-brand-500 hover:shadow-lg hover:shadow-brand-600/30 '
          + 'active:bg-brand-700',
        secondary:
          'border border-slate-200 bg-white text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        danger:
          'border border-red-200 bg-red-50 text-red-600 hover:border-red-300 hover:bg-red-100',
        outline:
          'border border-brand-200 bg-white text-brand-700 hover:border-brand-300 hover:bg-brand-50',
        link: 'text-brand-700 underline-offset-4 hover:underline'
      },
      size: {
        xs: 'h-8 rounded-lg px-3 text-[11px]',
        sm: 'h-9 rounded-lg px-3.5 text-xs',
        md: 'h-10 px-5 text-sm',
        lg: 'h-12 rounded-xl px-7 text-base',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8 rounded-lg'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
);

export const Button = forwardRef(function Button({ className, variant, size, loading, disabled, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={twMerge(clsx(buttonVariants({ variant, size, className })))}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
