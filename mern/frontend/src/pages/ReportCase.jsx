import { useSearchParams } from 'react-router-dom';
import { PackageMinus, PackagePlus, ScanSearch, Sparkles, PackageCheck, ChevronRight } from 'lucide-react';
import ReportLost from './ReportLost';
import ReportFound from './ReportFound';
import { cn } from '../lib/cn';

/**
 * ReportCase — the single entry point for starting a case.
 *
 * There used to be two sidebar entries ("Report Lost" / "Report Found") that led
 * to two near-identical forms. That asked the user to know our data model before
 * they could ask for help. Now there is one Report destination, and the FIRST
 * question is the one a person can actually answer from memory: did you lose it
 * or find it?
 *
 * The form body is deliberately still the proven ReportLost / ReportFound
 * component: the AI scan, attribute extraction, photo upload, location picker,
 * autosave and submit path are unchanged, so consolidating the entry point
 * cannot regress the thing that has to work.
 *
 * The type lives in the URL (`/report?type=lost|found`), which is what makes the
 * old /report-lost and /report-found links redirect to the right form.
 */

/**
 * The product journey, in the only place a first-time member actually reads it:
 * the page where they hand over an item. Colour is carried by the ICONS only —
 * one selection colour (brand) keeps the choice unambiguous, while the icon tint
 * matches the lost/found identity used by every thumbnail in the product.
 */
const JOURNEY = [
  { icon: ScanSearch, label: 'AI reads it', hint: 'Category, colour, brand, text' },
  { icon: Sparkles, label: 'We match it', hint: 'Against every open report' },
  { icon: PackageCheck, label: 'You collect it', hint: 'Once ownership is proven' }
];

export default function ReportCase() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') === 'found' ? 'found' : 'lost';
  const isLost = type === 'lost';

  const choose = (next) => {
    const search = new URLSearchParams(params);
    search.set('type', next);
    setParams(search);
  };

  const CHOICES = [
    {
      value: 'lost',
      icon: PackageMinus,
      title: 'I lost something',
      hint: 'Search what your organization is holding',
      tint: 'text-amber-600'
    },
    {
      value: 'found',
      icon: PackagePlus,
      title: 'I found something',
      hint: 'Log it and start the chain of custody',
      tint: 'text-accent-600'
    }
  ];

  return (
    <div>
      {/* The one question that decides everything downstream. */}
      <div className="mb-5 rounded-2xl bg-white p-4 shadow-soft sm:p-5">
        <p className="text-sm font-bold text-brand-ink">What happened?</p>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {CHOICES.map((choice) => {
            const Icon = choice.icon;
            const selected = choice.value === type;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => choose(choice.value)}
                aria-pressed={selected}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all duration-200 ease-spring',
                  selected
                    ? 'bg-brand-50 shadow-ring'
                    : 'bg-slate-50/80 hover:-translate-y-0.5 hover:bg-white hover:shadow-soft'
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    selected ? 'bg-white shadow-xs' : 'bg-white/80'
                  )}
                >
                  <Icon className={cn('h-5 w-5', selected ? 'text-brand-600' : choice.tint)} />
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-sm font-extrabold', selected ? 'text-brand-ink' : 'text-slate-700')}>
                    {choice.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{choice.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* What happens after submit, shown before the work starts so nobody is
          surprised by an asynchronous scan. */}
      <ol className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        {JOURNEY.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.label} className="flex min-w-0 items-center gap-2">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />}
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate text-xs font-bold text-slate-600">{step.label}</span>
              <span className="hidden truncate text-[11px] text-slate-400 lg:inline">· {step.hint}</span>
            </li>
          );
        })}
      </ol>

      {/* Keyed on the type so switching genuinely remounts the form: a half-filled
          lost report must not leak its fields into a found report. */}
      {isLost ? <ReportLost key="lost" /> : <ReportFound key="found" />}
    </div>
  );
}
