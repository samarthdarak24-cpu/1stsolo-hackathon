import { MapPin, Clock, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ItemThumb } from '../ItemThumb';
import StatusBadge from '../StatusBadge';
import MatchMeter from './MatchMeter';
import { formatDate, itemName } from '../../lib/format';

/**
 * ItemCard — the visual unit of discovery.
 *
 * Design contract (search spec): the card carries IMAGE, NAME, TYPE, DATE,
 * LOCATION, STATUS and a match band. It deliberately does NOT carry the item
 * description: a wall of prose is what made the old list unreadable. The
 * description lives one interaction away, in the detail drawer.
 */
export default function ItemCard({ report, matchScore, onOpen, className }) {
  if (!report) return null;

  const isLost = report.type === 'LOST';

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-soft',
        'transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:shadow-lift',
        className
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col text-left focus-visible:outline-none"
        aria-label={`Open ${itemName(report)}`}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-50">
          <ItemThumb
            report={report}
            className="h-full w-full"
            rounded=""
            iconClass="h-9 w-9"
          />

          {/* Type flag. Category tint is meaningful: lost vs found is the first
              thing a browser filters on. */}
          <span
            className={cn(
              'absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide shadow-xs backdrop-blur',
              isLost ? 'bg-amber-50/95 text-amber-700' : 'bg-accent-50/95 text-accent-700'
            )}
          >
            {isLost ? 'Lost' : 'Found'}
          </span>

          <span className="absolute right-3 top-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow-xs">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 min-w-0 text-sm font-bold leading-snug text-brand-ink">
              {itemName(report)}
            </h3>
            <StatusBadge status={report.status} className="shrink-0" dot={false} />
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="truncate">{report.location || 'Location not shared'}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3 w-3 shrink-0" />
            {formatDate(report.createdAt)}
            {report.category && <span className="truncate">· {report.category}</span>}
          </p>

          {matchScore !== undefined && matchScore !== null && (
            <div className="mt-auto border-t border-slate-100 pt-3">
              <MatchMeter score={matchScore} size="sm" />
            </div>
          )}
        </div>
      </button>
    </article>
  );
}
