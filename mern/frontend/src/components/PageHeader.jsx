import { cn } from '../lib/cn';

/**
 * PageHeader — the single source of truth for a page's title block.
 *
 * Structure: optional eyebrow (context) → title → one-line subtitle → actions.
 * Because every screen uses this, vertical rhythm never drifts between pages.
 *
 * It is also the app's universal entrance: the header arrives as three small
 * beats (title → subtitle → actions) instead of one block fading, so EVERY page
 * — 28 of them use this component — starts with the same considered motion
 * without a single page-level animation being written. The stagger is 40ms
 * apart and the whole thing is over in ~350ms; it reads as the page settling,
 * not as an intro.
 *
 * The beats are CSS animations rather than a JS animation library. A JS-driven
 * entrance only advances while `requestAnimationFrame` is running, so a page
 * that mounts in a background tab (or any environment that throttles frames)
 * would render its own title at `opacity: 0` and keep it there. A heading that
 * can fail to appear is not worth the extra keystroke; CSS cannot get stuck.
 * The CSS media query for `prefers-reduced-motion` also covers this for free.
 *
 * The title is deliberately `text-xl`/`text-2xl`: a page heading that consumes
 * the fold pushes the primary action below it, which is the most common reason a
 * dashboard feels like it makes no request of the user.
 */

/** One entrance beat, `step` ms behind the last. */
const beat = (step) => (step ? { style: { animationDelay: `${step}ms` } } : {});

export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  badge,
  actions,
  className,
  children
}) {
  return (
    <header className={cn('mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p
            {...beat(0)}
            className="animate-fade-up mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600"
          >
            {eyebrow}
          </p>
        )}
        <div {...beat(40)} className="animate-fade-up flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-extrabold leading-tight tracking-tight text-brand-ink sm:text-2xl">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p {...beat(80)} className="animate-fade-up mt-1 max-w-2xl text-[13px] leading-snug text-slate-500">
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {actions && (
        <div {...beat(120)} className="animate-fade-up flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
