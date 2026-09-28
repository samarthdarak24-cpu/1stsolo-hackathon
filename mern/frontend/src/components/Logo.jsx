export default function Logo({ size = 'md', wordmark = true }) {
  const dims = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl';
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg className={`${dims} drop-shadow-sm`} fill="none" viewBox="0 0 32 32">
        <path
          d="M16 28C16 28 6 20.8 6 12.8C6 7.9 10.1 4 15 4C15.35 4 15.68 4.02 16 4.07C16.32 4.02 16.65 4 17 4C21.9 4 26 7.9 26 12.8C26 20.8 16 28 16 28Z"
          fill="url(#ll-logo-grad)"
          stroke="#0f766e"
          strokeWidth="1.2"
        />
        <circle cx="16" cy="13" fill="white" r="3.8" />
        <defs>
          <linearGradient id="ll-logo-grad" x1="6" x2="26" y1="4" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2dd4bf" />
            <stop offset="0.55" stopColor="#0d9488" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
        </defs>
      </svg>
      {/* The wordmark is optional: the app shell already states the product name,
          so the sidebar shows the mark alone and lets the context text do the
          naming. Passing wordmark renders it for standalone uses. */}
      {wordmark && (
        <span className={`${text} font-extrabold tracking-tight text-slate-900`}>
          LostLink&nbsp;<span className="text-brand-600">AI</span>
        </span>
      )}
    </span>
  );
}
