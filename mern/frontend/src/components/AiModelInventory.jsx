import { useState } from 'react';
import { Cpu, RefreshCw, ShieldCheck, ShieldAlert, CircleSlash, Loader2 } from 'lucide-react';
import PageHeader from './PageHeader';
import ErrorState from './ErrorState';
import { Button } from './ui/Button';
import { Skeleton } from './ui/Skeleton';
import { useModelInventory } from '../lib/queries';
import { cn } from '../lib/cn';

/**
 * AiModelInventory — the auditable answer to "is the AI real?"
 *
 * A status of "ready" is not evidence: it only says a process started. This panel
 * lists the actual checkpoint behind each role and then distinguishes three
 * states that are usually blurred together:
 *
 *   loaded          the weights are in memory
 *   verified        a real micro-inference ran in THIS response and returned a
 *                   usable result (pressed on demand, never assumed)
 *   not_configured  the dependency was never switched on - the vision model has
 *                   no endpoint. This is a supported deployment, not a fault.
 *
 * The raw result of each probe is shown verbatim, so a reviewer can see OCR
 * actually read the test text rather than take a green dot on trust.
 */
const STATUS_STYLE = {
  verified: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: ShieldCheck, label: 'Verified' },
  loaded: { chip: 'bg-sky-50 text-sky-700 ring-sky-200', icon: Cpu, label: 'Loaded' },
  lazy: { chip: 'bg-slate-100 text-slate-600 ring-slate-200', icon: Cpu, label: 'Not loaded yet' },
  not_configured: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', icon: CircleSlash, label: 'Not configured' },
  unavailable: { chip: 'bg-rose-50 text-rose-700 ring-rose-200', icon: ShieldAlert, label: 'Unavailable' }
};

function StatusChip({ status }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.lazy;
  const Icon = style.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1', style.chip)}>
      <Icon className="h-3 w-3" /> {style.label}
    </span>
  );
}

export default function AiModelInventory() {
  // Only fetch the verification pass when it is asked for: it loads models, which
  // costs real seconds, and pages must not do that on mount.
  const [verifyWanted, setVerifyWanted] = useState(false);
  const base = useModelInventory({ verify: false });
  const verified = useModelInventory({ verify: true, enabled: verifyWanted });

  const inventory = verifyWanted && verified.data ? verified.data : base.data;
  const running = verifyWanted && verified.isFetching;
  const error = base.error && !base.data ? base.error : null;

  const models = Object.entries(inventory?.models || {});
  const summary = inventory?.summary || {};

  return (
    <div>
      <PageHeader
        eyebrow="Insight"
        title="AI Models"
        subtitle="Which models are installed, what each one is for, and — on demand — proof that it computes."
        actions={(
          <Button
            variant="primary"
            onClick={() => {
              if (verifyWanted) verified.refetch();
              else setVerifyWanted(true);
            }}
            disabled={running}
          >
            {running
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Running inference…</>
              : <><RefreshCw className="h-4 w-4" /> Verify with real inference</>}
          </Button>
        )}
      />

      {error ? (
        <ErrorState
          variant="network"
          title="Inference service unreachable"
          description={error.message}
          onRetry={() => base.refetch()}
        />
      ) : null}

      {!inventory && !error ? <Skeleton className="h-64 w-full" /> : null}

      {inventory ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="text-slate-500">
              Device <span className="ml-1 font-bold text-slate-800">{inventory.device || 'unknown'}</span>
            </span>
            <span className="text-slate-500">
              Vector store
              <span className="ml-1 font-bold text-slate-800">
                {inventory.vector_store?.checkpoint || 'unknown'}
              </span>
            </span>
            <span className="text-slate-500">
              Verified now
              <span className="ml-1 font-bold text-slate-800">
                {summary.verified?.length ?? inventory.verified?.length ?? 0} of {summary.total || models.length}
              </span>
            </span>
            {!verifyWanted && (
              <span className="text-xs text-slate-400">
                Run the verification to prove each model computes.
              </span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {models.map(([name, model]) => (
              <div key={name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-900">{name}</p>
                    <p className="mt-0.5 text-xs leading-snug text-slate-500">{model.role}</p>
                  </div>
                  <StatusChip status={model.status} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="col-span-2">
                    <dt className="text-slate-400">Checkpoint</dt>
                    <dd className="truncate font-semibold text-slate-700">{model.checkpoint || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Device</dt>
                    <dd className="font-semibold text-slate-700">{model.device || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Dimension</dt>
                    <dd className="font-semibold text-slate-700">{model.dimension ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Load time</dt>
                    <dd className="font-semibold text-slate-700">
                      {typeof model.load_seconds === 'number' ? `${model.load_seconds}s` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Inference</dt>
                    <dd className="font-semibold text-slate-700">
                      {typeof model.latency_ms === 'number' ? `${model.latency_ms} ms` : 'not run'}
                    </dd>
                  </div>
                </dl>

                {/* The probe result, quoted rather than summarised: "OCR read the
                    test text" is falsifiable in a way that "ready" is not. */}
                {model.evidence ? (
                  <p className="mt-3 rounded-lg bg-emerald-50/70 px-3 py-2 text-[11px] leading-snug text-emerald-800">
                    {model.evidence}
                  </p>
                ) : null}
                {model.detail ? (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600">
                    {model.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {inventory.vector_store ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <p className="text-sm font-extrabold text-slate-900">Vector index</p>
              <p className="mt-0.5 text-xs text-slate-500">{inventory.vector_store.role}</p>
              <p className="mt-2 text-xs text-slate-600">
                <span className="font-bold text-slate-700">{inventory.vector_store.checkpoint}</span>
                {typeof inventory.vector_store.detail === 'object' && inventory.vector_store.detail
                  ? ` · ${inventory.vector_store.detail.degraded ? 'degraded' : 'durable'}`
                  : ''}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
