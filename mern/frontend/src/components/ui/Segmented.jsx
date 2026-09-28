import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

/**
 * Segmented — the pill tab bar used for in-page view switching.
 *
 * The active pill is a single shared `layoutId` element, so switching reads as
 * one control sliding rather than two elements repainting. Options may carry a
 * count, which renders as a quiet superscript.
 *
 * `variant="underline"` is the lighter form used inside a card header.
 */
export default function Segmented({
  options = [],
  value,
  onChange,
  size = 'md',
  variant = 'pill',
  className,
  ariaLabel
}) {
  const active = options.find((o) => o.value === value) || options[0];

  const sizing = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-[13px]';

  if (variant === 'underline') {
    return (
      <div role="tablist" aria-label={ariaLabel} className={cn('flex gap-1 overflow-x-auto no-scrollbar', className)}>
        {options.map((option) => {
          const isActive = option.value === active?.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange?.(option.value)}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {option.label}
              {option.count !== undefined && option.count !== null && (
                <span className={cn('tabular-nums', isActive ? 'text-brand-600' : 'text-slate-400')}>
                  {option.count}
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId={`segmented-underline-${ariaLabel || 'default'}`}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full bg-brand-500"
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-slate-100/90 p-1 no-scrollbar', className)}
    >
      {options.map((option) => {
        const isActive = option.value === active?.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={option.hint}
            onClick={() => onChange?.(option.value)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-bold transition-colors',
              sizing,
              isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`segmented-pill-${ariaLabel || 'default'}`}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-white shadow-xs"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {option.label}
              {option.count !== undefined && option.count !== null && (
                <span className={cn('tabular-nums', isActive ? 'text-brand-600' : 'text-slate-400')}>
                  {option.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
