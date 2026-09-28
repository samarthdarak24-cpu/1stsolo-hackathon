import tailwindcssAnimate from 'tailwindcss-animate';
import lineClamp from '@tailwindcss/line-clamp';

/**
 * LostLink AI design tokens — v2.
 *
 * Everything visual is derived from this file so a change here propagates to
 * all 29 pages at once instead of being hand-edited per screen.
 *
 * v2 changes the expressive system, not the scale:
 *   - TEAL is the primary accent (was emerald). Teal reads as "trust +
 *     technology"; emerald survives as the success colour only.
 *   - ELEVATION over borders: cards are white + soft shadow; a border appears
 *     only on hover, on inputs, and on intentional dividers. The v1 palette
 *     painted a visible border on every box, which is the single biggest thing
 *     that made the UI read as an admin template.
 *   - Two accent families only (teal `brand`, blue `accent`). Green, amber and
 *     red are reserved for meaning: success, warning, error.
 *
 * Scale: 8px spacing rhythm, 16-20px card radius, 40px control height.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        handwriting: ['Caveat', 'cursive']
      },
      colors: {
        // `brand` is the primary product accent. Teal scale chosen for a calm,
        // professional feel on white; the deep end doubles as heading ink on
        // marketing surfaces.
        brand: {
          50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
          500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a',
          // The dark ink for marketing surfaces (dark demo panels, dark buttons).
          // Deliberately a deep TEAL, not a navy: near-black navy read as "blue"
          // and pulled the palette back towards the generic template look.
          950: '#042f2e',
          // Legacy aliases kept so older pages render unchanged during the
          // migration: `emerald` now points at the success green, `teal` at the
          // secondary blue.
          emerald: '#059669', teal: '#0284c7',
          // Navy ink for headings on light surfaces.
          ink: '#0B1220'
        },
        // Secondary accent: blue for informational surfaces (found items,
        // links, secondary highlights). Used sparingly so teal owns the brand.
        accent: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
          500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a'
        }
      },
      borderRadius: {
        xl: '0.75rem', '2xl': '1rem', '3xl': '1.25rem', '4xl': '1.5rem'
      },
      boxShadow: {
        // Elevation ladder — the whole v2 look hangs on these five values.
        // Layered, low-opacity shadows read as depth without the grey haze a
        // heavy drop shadow leaves on a light background. Borders are NOT part
        // of the ladder; a resting card is borderless by default.
        xs: '0 1px 2px rgba(11,18,32,0.05)',
        soft: '0 1px 2px rgba(11,18,32,0.04), 0 6px 20px -6px rgba(11,18,32,0.08)',
        card: '0 2px 4px rgba(11,18,32,0.04), 0 16px 32px -12px rgba(11,18,32,0.12)',
        pop: '0 12px 48px -12px rgba(11,18,32,0.20)',
        lift: '0 4px 10px rgba(11,18,32,0.06), 0 24px 48px -16px rgba(11,18,32,0.18)',
        // Focus/action rings keep a whisper of the border idea for interactive
        // surfaces without drawing a full rectangle.
        ring: '0 0 0 1px rgba(20,184,166,0.28), 0 8px 24px -8px rgba(13,148,136,0.25)',
        glow: '0 0 0 1px rgba(20,184,166,0.20), 0 12px 40px -12px rgba(13,148,136,0.35)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,0.7)'
      },
      keyframes: {
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'pulse-soft': { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
        flow: { to: { strokeDashoffset: '-24' } },
        // Entrances END on `transform: none`, never `translateY(0)`: a retained
        // transform makes the element a containing block, which silently breaks
        // any `position: sticky`/`fixed` child (the table headers, the sticky
        // detail rails). `none` animates identically and leaves the layout clean.
        'fade-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(14px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in-left': { from: { opacity: '0', transform: 'translateX(-14px)' }, to: { opacity: '1', transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.96)' }, to: { opacity: '1', transform: 'none' } },
        // A light sweeping across a surface once — used to confirm a save.
        sheen: { '0%': { transform: 'translateX(-120%)' }, '100%': { transform: 'translateX(220%)' } },
        // Form-level error shake: three small sidesteps, then still. Runs once;
        // re-submitting re-triggers it because React remounts the banner.
        shake: {
          '10%,90%': { transform: 'translateX(-1px)' },
          '20%,80%': { transform: 'translateX(2px)' },
          '30%,50%,70%': { transform: 'translateX(-4px)' },
          '40%,60%': { transform: 'translateX(4px)' }
        },
        // Inline banners (org detection, errors, success confirmations) drop in
        // from directly above their own slot, so they read as appearing in the
        // flow rather than flying across the page.
        'slide-down': { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'none' } },
        // Radar ripple behind a scanning frame (the landing page's AI vision box).
        echo: {
          '0%': { transform: 'scale(.6)', opacity: '.55' },
          '100%': { transform: 'scale(1.9)', opacity: '0' }
        },
        // A typing cursor for the live "AI is reading" look.
        caret: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
        // One-shot arrow nudges for hover affordances.
        'nudge-right': { '0%,100%': { transform: 'none' }, '50%': { transform: 'translateX(2px)' } },
        'nudge-down': { '0%,100%': { transform: 'none' }, '50%': { transform: 'translateY(2px)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        // Slow-drifting colour wash used behind the app shell. Two offset
        // radial gradients give the "premium" depth without an image asset.
        'mesh-drift': {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(2%,-3%,0) scale(1.06)' }
        },
        'shimmer-line': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        },
        // `from` must be a quoted key: written bare it parses as a function body.
        'count-in': { 'from': { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'none' } },
        'scan-line': { '0%': { top: '0%' }, '100%': { top: '100%' } },
        // Success confirmation: a small pop for the returned-item state.
        // Meters and progress bars grow from their left edge on mount, so a
        // match score reads as "measured" rather than "printed". Scale (not
        // width) keeps it off the layout thread; the end state is `none`.
        'bar-grow': { from: { transform: 'scaleX(0)' }, to: { transform: 'none' } },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.7)' },
          '60%': { transform: 'scale(1.06)' },
          '100%': { opacity: '1', transform: 'none' }
        },
        'draw-check': {
          '0%': { strokeDashoffset: 48 },
          '100%': { strokeDashoffset: 0 }
        }
      },
      animation: {
        floaty: 'floaty 5s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        flow: 'flow 1.4s linear infinite',
        'fade-up': 'fade-up .38s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .3s cubic-bezier(.22,1,.36,1) both',
        'slide-in-right': 'slide-in-right .34s cubic-bezier(.22,1,.36,1) both',
        'slide-in-left': 'slide-in-left .34s cubic-bezier(.22,1,.36,1) both',
        'scale-in': 'scale-in .26s cubic-bezier(.22,1,.36,1) both',
        sheen: 'sheen 1s cubic-bezier(.22,1,.36,1)',
        shake: 'shake .5s cubic-bezier(.36,.07,.19,.97) both',
        'slide-down': 'slide-down .26s cubic-bezier(.22,1,.36,1) both',
        echo: 'echo 2.2s cubic-bezier(.22,1,.36,1) infinite',
        caret: 'caret 1.1s step-end infinite',
        'nudge-right': 'nudge-right .4s cubic-bezier(.22,1,.36,1)',
        'nudge-down': 'nudge-down .4s cubic-bezier(.22,1,.36,1)',
        shimmer: 'shimmer 1.6s infinite',
        'mesh-drift': 'mesh-drift 24s ease-in-out infinite',
        'shimmer-line': 'shimmer-line 2.2s ease-in-out infinite',
        'count-in': 'count-in .32s cubic-bezier(.22,1,.36,1) both',
        'scan-line': 'scan-line 2s linear infinite',
        'bar-grow': 'bar-grow .8s .06s cubic-bezier(.22,1,.36,1) both',
        'pop-in': 'pop-in .45s cubic-bezier(.22,1,.36,1) both',
        'draw-check': 'draw-check .6s .25s cubic-bezier(.22,1,.36,1) both'
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.22,1,.36,1)'
      }
    }
  },
  plugins: [tailwindcssAnimate, lineClamp]
};
