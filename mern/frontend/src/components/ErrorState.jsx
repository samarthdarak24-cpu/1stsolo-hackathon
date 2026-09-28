/**
 * ErrorState — a friendly, stack-trace-free failure panel with retry.
 * Every query passes its error here so the product never shows a raw crash.
 */
import { AlertTriangle, RefreshCw, WifiOff, ShieldAlert, Inbox } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';

const ICONS = {
  network: WifiOff,
  permission: ShieldAlert,
  notfound: Inbox,
  default: AlertTriangle
};

/**
 * @param {{ error?: Error, title?: string, onRetry?: Function, variant?: 'default'|'permission'|'notfound', className?: string, compact?: boolean }} props
 */
export default function ErrorState({
  error,
  title,
  onRetry,
  variant = 'default',
  className,
  compact = false
}) {
  const status = error?.status;
  const resolvedVariant = variant !== 'default'
    ? variant
    : (status === 0 ? 'network' : status === 403 ? 'permission' : status === 404 ? 'notfound' : 'default');
  const Icon = ICONS[resolvedVariant] || AlertTriangle;

  const heading = title || (resolvedVariant === 'network'
    ? 'Cannot reach LostLink AI'
    : resolvedVariant === 'permission'
      ? 'You do not have access'
      : resolvedVariant === 'notfound'
        ? 'Not found'
        : 'Something went wrong');

  const message = error?.message
    || 'We hit an unexpected problem loading this view. Please try again.';

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3', className)}>
        <Icon className="h-4 w-4 shrink-0 text-rose-600" />
        <p className="flex-1 text-sm text-rose-800">{message}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry} className="shrink-0">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('card-surface flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{heading}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry && (
        <Button className="mt-5" variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}
