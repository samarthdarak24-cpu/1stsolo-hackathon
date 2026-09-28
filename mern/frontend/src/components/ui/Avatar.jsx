import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const avatarVariants = cva(
  'inline-flex items-center justify-center rounded-full font-bold text-white',
  {
    variants: {
      size: {
        sm: 'h-8 w-8 text-xs',
        md: 'h-10 w-10 text-sm',
        lg: 'h-12 w-12 text-base'
      },
      color: {
        default: 'bg-brand-600',
        primary: 'bg-brand-600',
        secondary: 'bg-slate-500',
        success: 'bg-emerald-500',
        warning: 'bg-amber-500',
        danger: 'bg-red-500'
      }
    },
    defaultVariants: {
      size: 'md',
      color: 'default'
    }
  }
);

export const Avatar = forwardRef(function Avatar({ className, size, color, initials, ...props }, ref) {
  return (
    <div ref={ref} className={cn(avatarVariants({ size, color, className }))} {...props}>
      {initials || <span>U</span>}
    </div>
  );
});
