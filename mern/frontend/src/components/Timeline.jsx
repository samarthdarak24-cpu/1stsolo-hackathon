import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';

/**
 * Timeline — vertical stepper used for recovery progress and return tracking.
 * @param {{ steps: {label:string, state:'done'|'current'|'upcoming', at?:string, detail?:string}[], className?: string, compact?: boolean }} props
 */
export default function Timeline({ steps = [], className, compact = false }) {
  return (
    <ol className={cn('relative space-y-0', className)}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const done = step.state === 'done';
        const current = step.state === 'current';
        return (
          <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  'absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 rounded-full',
                  done ? 'bg-brand-400' : 'bg-slate-200'
                )}
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                done && 'border-brand-500 bg-brand-500 text-white',
                current && 'border-brand-500 bg-white text-brand-600 ring-4 ring-brand-100',
                !done && !current && 'border-slate-300 bg-white text-slate-400'
              )}
            >
              {done ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn('text-sm font-semibold', done || current ? 'text-slate-900' : 'text-slate-400')}>
                {step.label}
              </p>
              {!compact && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {step.at ? formatDateTime(step.at) : current ? 'In progress' : 'Pending'}
                </p>
              )}
              {step.detail && <p className="mt-0.5 text-xs text-slate-400">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
