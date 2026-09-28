import { cn } from '../lib/cn';

/**
 * Chart primitives used by the organisation insights surface.
 *
 * All three take `tone` from the semantic palette (`primary`, `success`,
 * `warning`, `danger`, `neutral`) so a chart can never introduce a colour that
 * means nothing. Values are rendered as real DOM (not generated via
 * createElementNS) so they re-render correctly and stay accessible.
 */

const BAR_FILL = { primary: '#0d9488', success: '#059669', warning: '#f59e0b', danger: '#dc2626', neutral: '#94a3b8' };

/**
 * BarChart — the default column chart.
 * @param {{ data: {label:string,value:number}[], tone?: string, height?: number, className?: string, valueSuffix?: string }} props
 */
export function BarChart({ data = [], tone = 'primary', height = 180, className, valueSuffix = '' }) {
  const points = data.map((d) => ({ label: String(d.label ?? ''), value: Number(d.value) || 0 }));
  const max = Math.max(1, ...points.map((p) => p.value));

  if (!points.length) return null;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
            <span className="mb-1.5 text-center text-[10px] font-bold tabular-nums text-slate-400 opacity-0 transition group-hover:opacity-100">
              {p.value}
            </span>
            <div
              className="w-full rounded-t-md transition-all duration-500 ease-spring"
              style={{
                height: `${p.value > 0 ? Math.max(4, (p.value / max) * 100) : 2}%`,
                backgroundColor: p.value > 0 ? BAR_FILL[tone] || BAR_FILL.primary : '#e2e8f0'
              }}
              title={`${p.label}: ${p.value}${valueSuffix}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-slate-100 pt-2">
        {points.map((p, i) => (
          <span key={`label-${p.label}-${i}`} className="min-w-0 flex-1 truncate text-center text-[10px] font-semibold text-slate-400">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * RankingList — horizontal bars for "top N by count" (categories, zones).
 */
export function RankingList({ items = [], tone = 'primary', emptyLabel, limit = 7, className }) {
  const rows = items.slice(0, limit).map((i) => ({ label: i.label, value: Number(i.value) || 0 }));

  if (!rows.length) {
    return <p className={cn('py-6 text-center text-sm text-slate-400', className)}>{emptyLabel}</p>;
  }

  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <ul className={cn('space-y-3', className)}>
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-slate-700">{row.label}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-slate-400">
              {row.value}
              <span className="ml-1.5 font-semibold text-slate-300">
                {total > 0 ? `${Math.round((row.value / total) * 100)}%` : '0%'}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all duration-500 ease-spring"
              style={{ width: `${Math.max(row.value > 0 ? 4 : 0, (row.value / max) * 100)}%`, backgroundColor: BAR_FILL[tone] || BAR_FILL.primary }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Donut — a single-value ring used for a headline percentage.
 */
export function Donut({ value = 0, size = 132, stroke = 12, tone = 'primary', label, className }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${pct}%`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={BAR_FILL[tone] || BAR_FILL.primary} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tabular-nums tracking-tight text-brand-ink">{Math.round(pct)}%</span>
        {label && <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>}
      </div>
    </div>
  );
}
