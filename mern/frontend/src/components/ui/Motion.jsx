import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/cn';

/**
 * Motion primitives — the ONE place entrance animation is decided.
 *
 * Two mechanisms live here and the split is deliberate:
 *
 *   1. MOUNT-TIME entrances (reveal, stagger, success pop) are CSS keyframes.
 *      CSS animations run off the animation timeline, so they complete even when
 *      `requestAnimationFrame` is throttled — a background tab, a hidden webview,
 *      a headless capture. A JS-driven entrance in that situation leaves the
 *      element at its `initial` state, i.e. permanently at `opacity: 0`, which
 *      means content that never appears. Entrances are exactly the case where
 *      "invisible until the tab is focused" is unacceptable, so they never go
 *      through the JS animation loop.
 *
 *   2. INTERACTION-driven motion (a drawer, a dropdown, an expanding filter
 *      panel) stays on framer-motion, because the interaction itself proves the
 *      tab is visible and being rendered.
 *
 * Timing is shared: 0.34-0.42s, one curve, ≤10px of travel, and every entrance
 * ends on `transform: none` so nothing leaves a retained transform behind (which
 * would silently break `position: sticky` descendants).
 */

/** The one easing curve used by every entrance: fast out, soft settle. */
export const EASE_OUT = [0.22, 1, 0.36, 1];

/** Named timings for the framer-motion side (interaction-driven motion only). */
export const TIMING = {
  fast: { duration: 0.18, ease: EASE_OUT },
  base: { duration: 0.26, ease: EASE_OUT },
  slow: { duration: 0.4, ease: EASE_OUT },
  pop: { type: 'spring', stiffness: 420, damping: 30 },
  /** Sidebar/drawer slide. Slightly softer than `pop`. */
  slide: { type: 'spring', stiffness: 340, damping: 34 },
  /** Shared-layout elements (the active pill, the sidebar highlight). */
  layout: { type: 'spring', stiffness: 420, damping: 34 }
};

/**
 * Reveal — fades a block up as it mounts.
 *
 * Prefer `Stagger` (or the `.stagger` / `.stagger-fast` classes) for lists: it
 * reads the child order instead of hard-coding delays.
 */
export function Reveal({ delay = 0, className, children, style, ...rest }) {
  return (
    <div
      className={cn('animate-fade-up', className)}
      style={{ animationDelay: delay ? `${delay}ms` : undefined, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Stagger — the parent half of a sequenced entrance.
 *
 * The sequencing happens in CSS (`.stagger`), so children animate in DOM order
 * with no JS involved. `StaggerItem` exists so the intent is explicit and the
 * component can be restyled in one place; any direct child would animate, the
 * same way `Container`/`Item` pairs work in other design systems.
 */
export function Stagger({ fast = false, className, children, ...rest }) {
  return (
    <div className={cn(fast ? 'stagger-fast' : 'stagger', className)} {...rest}>
      {children}
    </div>
  );
}

/** StaggerItem — the child half of `Stagger`. The parent supplies the animation. */
export function StaggerItem({ className, children, ...rest }) {
  return (
    <div className={className} {...rest}>
      {children}
    </div>
  );
}

/**
 * Collapse — an animated height for disclosure panels (filters, evidence,
 * advanced options). Removes the "content appears instantly and shoves the page"
 * jump that a plain `{open && ...}` produces.
 *
 * Interaction-driven, so framer-motion is the right tool: the click that opens
 * the panel guarantees a running animation frame.
 */
export function Collapse({ open, duration = 0.26, className, children }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn('overflow-hidden', className)}
      initial={false}
      animate={reduce ? { opacity: open ? 1 : 0 } : { height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
      transition={{ duration, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/**
 * SuccessPop — the confirmation beat for a completed action (item returned,
 * claim verified). Wraps a check/dot and springs it in with a short overshoot;
 * the oversized `pop-in` CSS keyframe is kept for the full-screen celebration
 * states that want more amplitude.
 */
export function SuccessPop({ delay = 0, className, children, style, ...rest }) {
  return (
    <span
      className={cn('animate-pop-in', className)}
      style={{ animationDelay: delay ? `${delay}ms` : undefined, ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}

/**
 * Two ways in, one effect: the `.stagger` / `.stagger-fast` / `animate-fade-up`
 * classes are what the existing screens use directly in JSX, and the components
 * above are the same CSS wrapped in a component for new code. Pick whichever
 * reads better at the call site; never invent a third timing.
 */
