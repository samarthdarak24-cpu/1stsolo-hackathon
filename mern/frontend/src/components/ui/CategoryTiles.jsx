import {
  Backpack, Briefcase, Wallet, Smartphone, Laptop, Tablet, Headphones, Plug,
  Watch, KeyRound, CreditCard, Glasses, Droplet, Umbrella, Shirt, BookOpen,
  Dumbbell, Gem, Cpu, User, FileText, Package
} from 'lucide-react';
import { ITEM_CATEGORIES } from '../../lib/format';
import { cn } from '../../lib/cn';

/**
 * CategoryTiles — the visual category selector used by the report wizard.
 *
 * A category is the one field every member can answer instantly and the one the
 * matcher leans on hardest, so it gets tiles instead of a <select>: 22 options
 * are recognisable at a glance by shape, and picking one is a single tap rather
 * than open-scroll-hunt. The icon map is exported so Search, item drawers and
 * the org item list can render the same glyph for the same category — the
 * vocabulary and its picture live in exactly one place.
 */
export const CATEGORY_ICONS = {
  Backpack, Handbag: Briefcase, Wallet, Phone: Smartphone, Laptop, Tablet,
  Headphones, Charger: Plug, Watch, Keys: KeyRound, 'ID Card': CreditCard,
  Glasses, 'Water Bottle': Droplet, Umbrella, Clothing: Shirt, Books: BookOpen,
  'Sports Gear': Dumbbell, Jewellery: Gem, Electronics: Cpu, Personal: User,
  Documents: FileText, Other: Package
};

export function categoryIcon(category) {
  return CATEGORY_ICONS[category] || Package;
}

export default function CategoryTiles({
  value,
  onChange,
  options = ITEM_CATEGORIES,
  label = 'Category',
  error,
  className
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <p className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-600">
          {label} <span className="text-rose-500">*</span>
        </p>
      )}

      <div
        role="radiogroup"
        aria-label={label || 'Category'}
        className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
      >
        {options.map((option) => {
          const Icon = categoryIcon(option);
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange?.(option)}
              className={cn(
                // `tappable` gives the press a 3% dip: on a 22-tile grid the
                // only other feedback is a colour change, which is easy to miss
                // when the finger covers the tile.
                'group tappable flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition-all duration-200 ease-spring',
                selected
                  ? 'bg-brand-50 text-brand-700 shadow-ring'
                  : 'bg-slate-50/80 text-slate-500 hover:-translate-y-0.5 hover:bg-white hover:text-slate-700 hover:shadow-soft'
              )}
            >
              <Icon
                className={cn('h-5 w-5 transition-colors', selected ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-500')}
                strokeWidth={1.75}
              />
              <span className="text-[11px] font-bold leading-tight">{option}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
    </div>
  );
}
