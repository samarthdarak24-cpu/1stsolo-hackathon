import { forwardRef, useId } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Field — label + control + hint + error, in one primitive.
 *
 * Every form in the product uses this so the label type, the 6px gap, the focus
 * ring and the error position are identical on all screens. `error` is
 * announced with role="alert" and wired through aria-describedby.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
  htmlFor,
  action
}) {
  const id = useId();
  const controlId = htmlFor || id;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  return (
    <div className={cn('min-w-0', className)}>
      {(label || action) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={controlId} className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {label}
              {required && <span className="ml-0.5 text-brand-600">*</span>}
            </label>
          )}
          {action}
        </div>
      )}
      {typeof children === 'function' ? children({ id: controlId, hintId, errorId }) : children}
      {error ? (
        <p id={errorId} role="alert" className="field-error flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

/** Text-ish input wired to Field's generated ids. */
export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('input-base', invalid && 'border-red-300 focus:border-red-400 focus:ring-red-100', className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn('textarea-base resize-y', invalid && 'border-red-300 focus:border-red-400 focus:ring-red-100', className)}
      {...props}
    />
  );
});

/** Native select with a consistent chevron and no default browser chrome. */
export const Select = forwardRef(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn('select-base', invalid && 'border-red-300 focus:border-red-400 focus:ring-red-100', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
});

export default Field;
