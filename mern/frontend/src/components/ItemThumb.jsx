/**
 * ItemThumb — the single thumbnail rendered everywhere a report or match appears.
 *
 * Centralised so the no-image fallback, lazy loading and the broken-image guard
 * are identical on all 14 call sites. The fallback used to be an emoji on a flat
 * grey box; the previous revision then over-corrected into an amber/orange and
 * sky/cyan gradient pair, which put two more hues into every list.
 *
 * This version keeps the tint almost neutral and lets the ICON carry the
 * lost/found distinction, so a grid of twenty cards reads as one surface.
 */
import { useState } from 'react';
import { ImageOff, Package, PackageCheck } from 'lucide-react';
import { itemImage, itemName } from '../lib/format';
import { cn } from '../lib/cn';

const TONE = {
  LOST: { icon: Package, bg: 'bg-slate-100', tint: 'text-amber-600/70' },
  FOUND: { icon: PackageCheck, bg: 'bg-slate-100', tint: 'text-accent-600/70' }
};

export function ItemThumb({ report, className, rounded = 'rounded-xl', iconClass = 'h-8 w-8' }) {
  const src = itemImage(report);
  const [failed, setFailed] = useState(false);
  const tone = TONE[report?.type] || TONE.FOUND;
  const Icon = tone.icon;
  const frame = cn('relative overflow-hidden', tone.bg, rounded, className);

  if (!src || failed) {
    return (
      <div
        className={cn('flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100', frame)}
        aria-hidden="true"
      >
        <Icon className={cn(iconClass, tone.tint)} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className={frame}>
      <img
        src={src}
        alt={itemName(report)}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

export default ItemThumb;
