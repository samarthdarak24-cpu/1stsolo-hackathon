import {
  Inbox, Sparkles, Bell, PackageCheck, PackageOpen, Lock, SearchX, FileText, QrCode, Users
} from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';

/**
 * EmptyState — a zero-data state that still gives the user a next step.
 *
 * Two rules from the redesign: one sentence of copy (never a paragraph), and a
 * real action whenever one exists. An empty screen with nothing to click is the
 * single most common way a product feels unfinished.
 */
export default function EmptyState({
  icon,
  illustration,
  title = 'Nothing here yet',
  description,
  actionLabel,
  onAction,
  actionHref,
  tone = 'brand',
  className,
  compact = false,
  children
}) {
  /** `illustration` (an emoji string) and an emoji passed as `icon` are both
   *  accepted so pre-redesign call sites keep rendering their own glyph. */
  const glyph = typeof illustration === 'string' && illustration
    ? illustration
    : (typeof icon === 'string' ? icon : null);
  const Icon = glyph ? null : (icon || Inbox);
  const TONE = {
    brand: 'bg-brand-50 text-brand-600',
    neutral: 'bg-slate-100 text-slate-500',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    info: 'bg-accent-50 text-accent-600'
  }[tone] || 'bg-brand-50 text-brand-600';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-5 py-8' : 'px-6 py-12',
        className
      )}
    >
      <span className={cn('flex items-center justify-center rounded-2xl', TONE, compact ? 'h-11 w-11' : 'h-14 w-14')}>
        {glyph
          ? <span className={compact ? 'text-lg' : 'text-2xl'} aria-hidden="true">{glyph}</span>
          : <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={1.75} />}
      </span>

      <h3 className={cn('font-bold text-brand-ink', compact ? 'mt-3 text-sm' : 'mt-4 text-base')}>
        {title}
      </h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">{description}</p>
      )}

      {children}

      {actionLabel && (onAction || actionHref) && (
        <Button className="mt-5" onClick={onAction} size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Preset empty states — import and use directly, so two screens describing the
 * same absence cannot disagree in tone or length.
 */
export const EmptyStates = {
  NoReports: ({ onAction, actionLabel = 'Report an item' }) => (
    <EmptyState
      icon={FileText}
      title="No reports yet"
      description="Report a lost or found item and LostLink AI starts searching immediately."
      actionLabel={actionLabel}
      onAction={onAction}
    />
  ),

  NoMatches: ({ onAction, actionLabel = 'View my reports' }) => (
    <EmptyState
      icon={Sparkles}
      tone="info"
      title="No matches yet"
      description="The AI is still scanning new reports. Add detail or a photo to improve your chances."
      actionLabel={actionLabel}
      onAction={onAction}
    />
  ),

  NoNotifications: ({ onAction, actionLabel = 'Report an item' }) => (
    <EmptyState
      icon={Bell}
      tone="neutral"
      title="You're all caught up"
      description="Matches, verification results and handovers will appear here."
      actionLabel={actionLabel}
      onAction={onAction}
    />
  ),

  NoReturns: ({ onAction, actionLabel = 'View my reports' }) => (
    <EmptyState
      icon={PackageCheck}
      tone="neutral"
      title="No active returns"
      description="Once an item is verified and ready, its pickup code appears here."
      actionLabel={actionLabel}
      onAction={onAction}
    />
  ),

  NoItems: ({ onAction, actionLabel }) => (
    <EmptyState
      icon={PackageOpen}
      tone="neutral"
      title="Nothing in custody"
      description="Items appear here once they are logged at a desk."
      actionLabel={actionLabel}
      onAction={onAction}
    />
  ),

  NoAccess: () => (
    <EmptyState
      icon={Lock}
      tone="warning"
      title="Access restricted"
      description="Your role does not cover this section. Ask an organization admin."
    />
  ),

  NoSearch: ({ term, onAction, actionLabel }) => (
    <EmptyState
      icon={SearchX}
      compact
      title={term ? `No results for “${term}”` : 'No results'}
      description="Try a different name, brand, colour or location."
      actionLabel={actionLabel}
      onAction={onAction}
    />
  ),

  NoData: ({ title = 'No results', description, onAction, actionLabel = 'Clear filters' }) => (
    <EmptyState
      icon={SearchX}
      tone="neutral"
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  ),

  NoQr: ({ onAction, actionLabel = 'View my returns' }) => (
    <EmptyState
      icon={QrCode}
      tone="neutral"
      title="No pickup code yet"
      description="A one-time code is issued once staff mark the item ready."
      actionLabel={actionLabel}
      onAction={onAction}
    />
  ),

  NoPeople: ({ onAction, actionLabel }) => (
    <EmptyState
      icon={Users}
      tone="neutral"
      title="No members yet"
      description="Invite staff and members to join this organization."
      actionLabel={actionLabel}
      onAction={onAction}
    />
  )
};
