import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../lib/cn';

/**
 * SectionTabs — the sub-navigation inside a consolidated section.
 *
 * The sidebar answers "what do I need to do now?" and holds five or six items.
 * These tabs answer "which part of this task am I in?" without adding another
 * sidebar entry, which is how twenty features fit into eleven destinations.
 *
 * The active tab lives in the URL (`?tab=`), so a tab is linkable, survives a
 * refresh, and every old per-feature URL can redirect straight into the right
 * tab instead of being left undefined.
 *
 * `onSelect` lets a host react to a change (the Report page swaps its whole form
 * rather than only swapping a panel).
 *
 * The selected state is ONE shared element (`layoutId`) that slides between
 * tabs, exactly as the in-page `Segmented` control does — so the two tab styles
 * in the product behave alike instead of one sliding and one repainting.
 */
export default function SectionTabs({ label, tabs, param = 'tab', onSelect, className }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get(param);
  const active = tabs.find((t) => t.id === requested) || tabs[0];

  const select = (tab) => {
    const next = new URLSearchParams(params);
    next.set(param, tab.id);
    setParams(next);
    onSelect?.(tab);
  };

  return (
    <div
      className={cn(
        'mb-5 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <p className="px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600 sm:px-1.5">
        {label}
      </p>
      <div role="tablist" aria-label={label} className="flex overflow-x-auto rounded-xl bg-slate-100/80 p-1 scrollbar-thin">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={tab.hint}
              onClick={() => select(tab)}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={`section-tabs-${label}`}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 -z-0 rounded-lg bg-white shadow-sm ring-1 ring-brand-200/70"
                />
              )}
              <span className="relative flex items-center gap-2">
                {Icon && <Icon className="h-4 w-4" />}
                {tab.label}
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SectionPanel — the body underneath `SectionTabs`.
 *
 * Switching tabs used to replace the whole panel instantly, so a click read as
 * "the page jumped" rather than "I moved to another view". The panel is keyed on
 * the tab id and re-enters with a short rise.
 *
 * It deliberately does NOT use `<AnimatePresence mode="wait">`: under React
 * StrictMode that pairing can leave the exiting child mounted and blank the
 * panel — the same trap the app shell documents. A keyed one-shot enter gives
 * the transition without a way to get stuck.
 *
 * The enter is a CSS animation (not framer-motion) so a deep link straight to a
 * tab — which can open in a background tab, where JS animation frames are
 * throttled — still renders its panel instead of leaving it at `opacity: 0`.
 */
export function SectionPanel({ tab, className, children }) {
  return (
    <div key={tab} className={cn('animate-fade-up', className)}>
      {children}
    </div>
  );
}
