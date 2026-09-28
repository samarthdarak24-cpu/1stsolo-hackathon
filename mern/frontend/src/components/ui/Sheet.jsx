import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Sheet — the right-hand detail drawer.
 *
 * Used wherever a list item opens "more" without leaving the list: search
 * results, match candidates, custody rows. Keeping the list mounted behind the
 * drawer is what makes browsing feel continuous instead of like a series of
 * navigations.
 *
 * Rendered through a portal so it is never clipped by a parent's overflow, and
 * it traps Escape plus background scroll.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  footer,
  side = 'right',
  width = 'max-w-lg',
  children
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const initial = side === 'right' ? { x: '100%' } : { x: '-100%' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[95]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'Details'}
            initial={initial}
            animate={{ x: 0 }}
            exit={initial}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className={cn(
              'absolute inset-y-0 flex w-full flex-col bg-white shadow-pop',
              side === 'right' ? 'right-0' : 'left-0',
              width
            )}
          >
            {(title || onClose) && (
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div className="min-w-0">
                  {title && <h2 className="truncate text-base font-bold text-brand-ink">{title}</h2>}
                  {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">{children}</div>

            {footer && (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
                {footer}
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
