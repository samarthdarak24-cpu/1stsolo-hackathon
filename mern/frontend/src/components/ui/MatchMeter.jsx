import { cn } from '../../lib/cn';

/**
 * MatchMeter — how a match score is presented, everywhere.
 *
 * The product rule (from the match-analysis spec) is that a bare "92%" invites
 * over-reading: a high number says nothing about who owns the item. So a score
 * is ALWAYS rendered as a number plus a band, and the band is what carries the
 * meaning.
 *
 * Bands mirror the server's own thresholds so the UI cannot invent a label:
 *   >= 85 High · >= 65 Medium · else Low
 */
export function bandFor(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'Low';
  if (n >= 85) return 'High';
  if (n >= 65) return 'Medium';
  return 'Low';
}

const BAND_STYLE = {
  High: { text: 'text-emerald-700', track: 'bg-emerald-100', fill: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700' },
  Medium: { text: 'text-amber-700', track: 'bg-amber-100', fill: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
  Low: { text: 'text-slate-600', track: 'bg-slate-100', fill: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600' }
};

export function bandStyle(band) {
  return BAND_STYLE[band] || BAND_STYLE.Low;
}

/**
 * @param {{ score:number, band?:string, size?:'sm'|'md'|'lg', showTrack?:boolean, className?:string }} props
 */
export default function MatchMeter({ score, band, size = 'md', showTrack = true, className }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const resolvedBand = band || bandFor(value);
  const style = bandStyle(resolvedBand);

  const valueClass = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-3xl'
  }[size];

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('font-extrabold leading-none tabular-nums tracking-tight text-brand-ink', valueClass)}>
          {value}%
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide', style.pill)}>
          {resolvedBand}
        </span>
      </div>
      {showTrack && (
        <div className={cn('mt-2 h-1.5 w-full overflow-hidden rounded-full', style.track)}>
          <div
            className={cn('h-full origin-left animate-bar-grow rounded-full transition-all duration-700 ease-spring', style.fill)}
            style={{ width: `${value}%` }}
          />
        </div>
      )}
    </div>
  );
}
