import { useRef, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Package, Sparkles, FileText, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useSearch } from '../lib/queries';
import { itemName, scoreTone } from '../lib/format';
import { cn } from '../lib/cn';

/**
 * GlobalSearchBar — org-scoped search over reports and matches.
 * Groups results into Lost Reports / Found Reports / AI Matches.
 */
export default function GlobalSearchBar({ className }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef(null);
  const navigate = useNavigate();
  const { activeOrganizationId } = useOrganization();
  const { isOrgAdmin } = useAuth();
  const { data, isFetching } = useSearch(activeOrganizationId, term);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (path) => { setOpen(false); setTerm(''); setCursor(0); navigate(path); };

  const lost = data?.lostReports || [];
  const found = data?.foundReports || [];
  const matches = data?.matches || [];
  const hasResults = lost.length + found.length + matches.length > 0;

  // A manager searching should land on the organization screens, not on their
  // own (usually empty) personal report list.
  const reportList = isOrgAdmin ? '/organization/recovery?tab=reports' : '/recovery?tab=cases';
  const matchList = isOrgAdmin ? '/organization/recovery?tab=matches' : '/matches';
  const reportPath = (id) => (isOrgAdmin ? `/organization/recovery?tab=reports&reportId=${id}` : `/recovery/${id}`);

  // One flat list so arrow keys can move across groups, not just within one.
  const flat = useMemo(() => [
    ...lost.map((r) => ({ key: `l-${r.id}`, path: reportPath(r.id) })),
    ...found.map((r) => ({ key: `f-${r.id}`, path: reportPath(r.id) })),
    ...matches.map((m) => ({ key: `m-${m.match.id}`, path: `${matchList}/${m.match.id}` }))
  ], [lost, found, matches, isOrgAdmin]);

  useEffect(() => { setCursor(0); }, [term]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Enter' && flat.length) {
      e.preventDefault();
      go(flat[Math.min(cursor, flat.length - 1)].path);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  /** Index of a row inside `flat`, so the highlighted row can be styled. */
  const cursorAt = (prefix, id) => flat.findIndex((f) => f.key === `${prefix}-${id}`);

  const rowCls = (active) => cn(
    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left',
    active ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'
  );

  const Group = ({ label, items, render, pathFor }) => (
    items.length > 0 && (
      <div className="px-2 py-1.5">
        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        {items.map((item, i) => render(item, i))}
        {pathFor && <button onClick={() => go(pathFor)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-brand-600 hover:bg-brand-50">View all {label.toLowerCase()}</button>}
      </div>
    )
  );

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search reports, items, matches..."
          role="combobox"
          aria-expanded={open && term.length >= 2}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          className="w-full rounded-full border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-9 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {isFetching && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />}
        {term && !isFetching && (
          <button onClick={() => { setTerm(''); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && term.length >= 2 && (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-pop scrollbar-thin"
        >
          {!hasResults && !isFetching && (
            <p className="px-3 py-6 text-center text-sm text-slate-500">No results for “{term}” in this organization.</p>
          )}

          <Group
            label="Lost Reports"
            pathFor={`${reportList}?type=LOST`}
            items={lost}
            render={(r) => (
              <button key={r.id} onClick={() => go(reportPath(r.id))} className={rowCls(cursorAt('l', r.id) === cursor)}>
                <Package className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{itemName(r)}</span>
                  <span className="block truncate text-xs text-slate-500">{r.location} · {r.reference}</span>
                </span>
              </button>
            )}
          />

          <Group
            label="Found Reports"
            pathFor={`${reportList}?type=FOUND`}
            items={found}
            render={(r) => (
              <button key={r.id} onClick={() => go(reportPath(r.id))} className={rowCls(cursorAt('f', r.id) === cursor)}>
                <Package className="h-4 w-4 shrink-0 text-sky-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{itemName(r)}</span>
                  <span className="block truncate text-xs text-slate-500">{r.location} · {r.reference}</span>
                </span>
              </button>
            )}
          />

          <Group
            label="AI Matches"
            pathFor={matchList}
            items={matches}
            render={(m) => (
              <button key={m.match.id} onClick={() => go(`${matchList}/${m.match.id}`)} className={rowCls(cursorAt('m', m.match.id) === cursor)}>
                <Sparkles className={cn('h-4 w-4 shrink-0', scoreTone(m.match.finalScore) === 'success' ? 'text-violet-500' : 'text-amber-500')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{itemName(m.lost)} ↔ {itemName(m.found)}</span>
                  <span className="block text-xs text-slate-500">{m.match.finalScore}% match</span>
                </span>
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
}
