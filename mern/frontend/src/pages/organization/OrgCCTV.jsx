import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Camera, CheckCircle2, Eye, Info, Loader2, MapPin, Play, Search, ShieldQuestion, Video, X
} from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useAnalyzeClip, useCctvEvents, useCctvStatus, useOrgSettings, useReports } from '../../lib/queries';
import { useToast } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/ui/Button';
import { SkeletonList } from '../../components/ui/Skeleton';
import { formatDate, formatDateTime, itemName, relativeTime, statusLabel } from '../../lib/format';
import { ItemThumb } from '../../components/ItemThumb';

const hasLastSeen = (report) => Boolean(report.lastSeen && Object.values(report.lastSeen).some(Boolean));
const hasCctvEvents = (report) => Array.isArray(report.cctvEvents) && report.cctvEvents.length > 0;

/**
 * OrgCCTV — evidence board built entirely from real report data.
 *
 * There is no camera API in this build: no stream, no snapshot endpoint, no
 * retention service. What we can show honestly is what reporters recorded when
 * they filed the report — `lastSeen` (location / time / landmark / notes) and any
 * `cctvEvents` references they attached — plus the organization's own policy on
 * camera requests. Nothing here pretends to be a video player.
 *
 * Endpoint: GET /api/reports?scope=all and GET /api/organizations/:id/settings.
 */
export default function OrgCCTV() {
  const navigate = useNavigate();
  const { activeOrganizationId, activeOrganization } = useOrganization();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch } = useReports(activeOrganizationId, {
    scope: 'all',
    limit: 200
  });
  const { data: settingsData } = useOrgSettings(activeOrganizationId);
  const settings = settingsData?.settings;

  // Live capability report from the analysis service — this is what decides
  // whether a clip can be searched at all, so the page never has to guess.
  const { data: cctvStatus } = useCctvStatus(activeOrganizationId);
  const analyze = useAnalyzeClip(activeOrganizationId);
  const toast = useToast();

  // Clip-search form. Kept local because the value is a path on the ANALYSIS
  // service's host — it means nothing anywhere else in the app.
  const [clipForm, setClipForm] = useState({ reportId: '', camera: '', videoPath: '', sampleFps: '0.5' });
  const [clipResult, setClipResult] = useState(null);
  const [clipError, setClipError] = useState(null);
  // Which item's recorded evidence to show. Fetched on demand from
  // GET /api/cctv/events/:reportId rather than trusted from the list payload.
  const [evidenceFor, setEvidenceFor] = useState(null);
  const { data: evidenceData, isFetching: evidenceLoading } = useCctvEvents(activeOrganizationId, evidenceFor);

  const searchReady = Boolean(
    cctvStatus?.aiEnabled && cctvStatus?.detectionReady && cctvStatus?.cameraRequestsAllowed
  );

  const submitClip = async (event) => {
    event.preventDefault();
    setClipError(null);
    setClipResult(null);
    try {
      const result = await analyze.mutateAsync({
        reportId: clipForm.reportId,
        videoPath: clipForm.videoPath.trim(),
        camera: clipForm.camera.trim(),
        sampleFps: Number(clipForm.sampleFps) || 0.5
      });
      setClipResult(result);
      const found = result.events?.length || 0;
      if (found) toast.success(`${found} item track(s) found in the clip`);
      else toast.info('Clip analysed — no tracked item was found');
    } catch (err) {
      setClipError(err);
      toast.error(err.message);
    }
  };

  const reports = data?.reports || [];
  const withLastSeen = useMemo(() => reports.filter(hasLastSeen), [reports]);
  const withCctv = useMemo(() => reports.filter(hasCctvEvents), [reports]);
  const evidence = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return { lastSeen: withLastSeen, cctv: withCctv };
    const hit = (report, ...fields) => fields.filter(Boolean).join(' ').toLowerCase().includes(term);
    return {
      lastSeen: withLastSeen.filter((r) => hit(
        r,
        r.lastSeen?.location,
        r.lastSeen?.landmark,
        r.lastSeen?.notes,
        r.lastSeen?.time,
        r.itemProfile?.itemName,
        r.category,
        r.reference
      )),
      cctv: withCctv.filter((r) => hit(
        r,
        (r.cctvEvents || []).join(' '),
        r.itemProfile?.itemName,
        r.category,
        r.reference
      ))
    };
  }, [withLastSeen, withCctv, search]);

  const camerasAllowed = settings?.allowCctvRequests;

  return (
    <div>
      <PageHeader
        title="Last seen & camera evidence"
        subtitle={`Sighting information reporters filed with ${activeOrganization?.name || 'this organization'} · ${reports.length} reports scanned`}
        badge={!cctvStatus ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking the analysis service
          </span>
        ) : searchReady ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Analysis service connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
            <ShieldQuestion className="h-3 w-3" /> Clip search unavailable
          </span>
        )}
      />

      <section className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          <div className="text-sm leading-relaxed text-sky-900">
            <p className="font-bold">What this page is — and what it is not</p>
            <p className="mt-1.5">
              LostLink AI stores the <em>last-seen</em> details an owner enters when they file a report, plus any
              camera references they attach by hand. This build has <strong>no camera integration</strong>: there is no
              live feed, no snapshot download and no footage retention behind this screen, so nothing here plays or
              streams video. Everything below is reporter-supplied evidence already stored on the report record.
            </p>
            <p className="mt-1.5">
              {camerasAllowed
                ? 'Your organization currently allows camera requests, but with no provider connected a request cannot be fulfilled automatically. Record the sighting on the report instead.'
                : 'Your organization has camera requests switched off in organization settings, so staff cannot request footage. Enable it in settings when a camera provider is connected.'}
            </p>
            {cctvStatus?.notice && (
              <p className="mt-1.5 flex items-start gap-2 rounded-lg bg-white/70 px-3 py-2">
                {searchReady
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <span>{cctvStatus.notice}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Reports scanned"
          value={reports.length}
          icon={<Video className="h-5 w-5" />}
          color="slate"
          loading={isLoading}
          description="Every report in the organization"
        />
        <StatCard
          label="With a last-seen record"
          value={withLastSeen.length}
          icon={<Eye className="h-5 w-5" />}
          color="sky"
          loading={isLoading}
          description="Location and time recorded by the owner"
        />
        <StatCard
          label="Camera references"
          value={withCctv.length}
          icon={<Camera className="h-5 w-5" />}
          color="rose"
          loading={isLoading}
          description="Reports carrying a camera reference"
        />
      </div>

      <div className="card-surface mb-5 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search sightings by item, landmark, camera reference or report code…"
            className="w-full rounded-full border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-9 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <SkeletonList count={4} />
      ) : (
        !isError && (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="card-surface p-5">
              <h2 className="text-base font-bold text-slate-900">Last seen</h2>
              <p className="mb-4 text-sm text-slate-500">Where and when owners say they last had the item.</p>
              {evidence.lastSeen.length === 0 ? (
                <EmptyState
                  compact
                  illustration="🗺️"
                  title={search ? 'No sightings match your search' : 'No last-seen records yet'}
                  description={search
                    ? 'Try an item name, a landmark, or the report code.'
                    : 'When someone reports an item as lost they can record where they last saw it. Those records land here.'}
                />
              ) : (
                <ul className="space-y-3">
                  {evidence.lastSeen.map((report, i) => (
                    <motion.li
                      key={report.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                    >
                      <button
                        onClick={() => navigate(`/organization/recovery?tab=reports&reportId=${report.id}`)}
                        className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-lg">
                            <ItemThumb report={report} className="h-full w-full" rounded="" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">{itemName(report)}</p>
                            <p className="truncate text-xs text-slate-500">{report.reference} · {report.category}</p>
                          </div>
                          <StatusBadge status={report.status} />
                        </div>

                        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <dt className="font-bold uppercase tracking-wider text-slate-400">Location</dt>
                            <dd className="mt-0.5 font-semibold text-slate-700">{report.lastSeen?.location || '—'}</dd>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <dt className="font-bold uppercase tracking-wider text-slate-400">When</dt>
                            <dd className="mt-0.5 font-semibold text-slate-700">
                              {report.lastSeen?.time ? formatDateTime(report.lastSeen.time) : relativeTime(report.createdAt)}
                            </dd>
                          </div>
                          {report.lastSeen?.landmark && (
                            <div className="rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                              <dt className="font-bold uppercase tracking-wider text-slate-400">Landmark</dt>
                              <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-slate-700">
                                <MapPin className="h-3.5 w-3.5 text-slate-400" /> {report.lastSeen.landmark}
                              </dd>
                            </div>
                          )}
                          {report.lastSeen?.notes && (
                            <div className="rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                              <dt className="font-bold uppercase tracking-wider text-slate-400">Notes</dt>
                              <dd className="mt-0.5 text-slate-700">{report.lastSeen.notes}</dd>
                            </div>
                          )}
                        </dl>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card-surface p-5">
              <h2 className="text-base font-bold text-slate-900">Camera references</h2>
              <p className="mb-4 text-sm text-slate-500">
                Text references attached to a report. No footage is stored or streamed by this build.
              </p>
              {evidence.cctv.length === 0 ? (
                <EmptyState
                  compact
                  illustration="📹"
                  title={search ? 'No camera references match your search' : 'No camera references attached'}
                  description={search
                    ? 'Try a different camera name or report code.'
                    : 'Camera references appear here when staff record them against a report. Without a connected camera provider there is no footage behind the reference.'}
                />
              ) : (
                <ul className="space-y-3">
                  {evidence.cctv.map((report, i) => (
                    <motion.li
                      key={report.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                    >
                      <button
                        onClick={() => navigate(`/organization/recovery?tab=reports&reportId=${report.id}`)}
                        className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-rose-200 hover:bg-rose-50/40"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                            <Camera className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">{itemName(report)}</p>
                            <p className="truncate text-xs text-slate-500">{report.reference} · reported {formatDate(report.createdAt)}</p>
                          </div>
                          <StatusBadge status={report.status} />
                        </div>
                        <ul className="mt-3 space-y-1.5">
                          {report.cctvEvents.slice(0, 3).map((event, idx) => (
                            <li
                              key={`${report.id}-event-${idx}`}
                              className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700"
                            >
                              <Camera className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="truncate font-semibold">{typeof event === 'string' ? event : JSON.stringify(event)}</span>
                            </li>
                          ))}
                          {report.cctvEvents.length > 3 && (
                            <li className="px-3 text-[11px] text-slate-400">
                              +{report.cctvEvents.length - 3} more recorded reference(s)
                            </li>
                          )}
                        </ul>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEvidenceFor(evidenceFor === report.id ? null : report.id);
                            }}
                          >
                            {evidenceFor === report.id ? 'Hide evidence' : 'View structured evidence'}
                          </Button>
                          <p className="text-[11px] text-slate-400">
                            {report.cctvEvents.length} reference(s) on file
                          </p>
                        </div>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}

              {/* Structured evidence, read back from GET /api/cctv/events/:id.
                  Deliberately a second request: the list payload is a summary, and
                  an auditor gets the checkable rows (label, confidence, track,
                  frame count) rather than a sentence to trust. */}
              {evidenceFor && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">Structured clip evidence</p>
                    {evidenceLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                  </div>

                  {!evidenceLoading && evidenceData && (
                    <>
                      <p className="mt-1 text-xs text-slate-500">{evidenceData.notice}</p>
                      {evidenceData.events.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500">
                          Nothing has been searched for this item yet, so there is no evidence to show. An empty list
                          here is the honest answer — it is never filled in with an estimate.
                        </p>
                      ) : (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[520px] text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400">
                                <th className="py-2 pr-3">Camera</th>
                                <th className="py-2 pr-3">Detected</th>
                                <th className="py-2 pr-3">Label</th>
                                <th className="py-2 pr-3">Track</th>
                                <th className="py-2 pr-3">Frames</th>
                                <th className="py-2 pr-3">Confidence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {evidenceData.events.map((row) => (
                                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                                  <td className="py-2 pr-3 font-semibold text-slate-700">{row.camera}</td>
                                  <td className="py-2 pr-3 text-slate-500">{row.clipTime || '—'}</td>
                                  <td className="py-2 pr-3 text-slate-700">{row.label}</td>
                                  <td className="py-2 pr-3 font-mono text-slate-500">
                                    {row.trackId ?? '—'}
                                  </td>
                                  <td className="py-2 pr-3 tabular-nums text-slate-500">{row.frameCount ?? '—'}</td>
                                  <td className="py-2 pr-3 tabular-nums text-slate-700">
                                    {row.confidence == null ? 'n/a' : `${Math.round(row.confidence * 100)}%`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="mt-3 text-[11px] text-slate-400">{evidenceData.methodology}</p>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        )
      )}

      <section className="card-surface mt-6 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Play className="h-5 w-5 text-brand-600" /> Search one clip
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Runs the object-tracking model over a clip that already sits on the analysis service&apos;s own disk, then
          records what it saw against the report. Not a live feed — nothing is pulled from a camera — and the model
          tracks items only, so it is never asked to identify a person.
        </p>

        {!searchReady ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">Clip search is not available in this environment</p>
              <p className="mt-1">{cctvStatus?.notice || 'Checking whether the analysis service can search video…'}</p>
            </div>
          </div>
        ) : (
          <form onSubmit={submitClip} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Which report is this about</span>
              <select
                required
                value={clipForm.reportId}
                onChange={(e) => setClipForm(f => ({ ...f, reportId: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Choose a report…</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference || r.id} · {itemName(r)} · {statusLabel(r.status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Clip path on the analysis service</span>
              <input
                required
                value={clipForm.videoPath}
                onChange={(e) => setClipForm(f => ({ ...f, videoPath: e.target.value }))}
                placeholder="/var/lostlink/clips/gate-cam-2026-09-24.mp4"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                An operator must have placed the file on the analysis host. This app cannot fetch it from a camera.
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Camera label</span>
              <input
                value={clipForm.camera}
                onChange={(e) => setClipForm(f => ({ ...f, camera: e.target.value }))}
                placeholder="Gate camera 3"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Frames sampled per second</span>
              <input
                type="number"
                min="0.05"
                max="5"
                step="0.05"
                value={clipForm.sampleFps}
                onChange={(e) => setClipForm(f => ({ ...f, sampleFps: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Long clips are sampled sparsely on purpose; 0.5 reads two frames a second.
              </span>
            </label>

            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" loading={analyze.isPending} disabled={!reports.length}>
                {analyze.isPending ? 'Searching the clip…' : <><Play className="h-4 w-4" /> Search the clip</>}
              </Button>
              {!reports.length && (
                <span className="text-xs text-slate-400">No reports exist in this organization yet.</span>
              )}
            </div>
          </form>
        )}

        {clipError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-bold">The clip could not be analysed</p>
            <p className="mt-1">{clipError.message}</p>
            <p className="mt-1 text-xs">
              Nothing was invented in its place — when the model cannot run, no timeline is shown.
            </p>
          </div>
        )}

        {clipResult && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">
                {clipResult.events.length} item track(s) · {clipResult.framesAnalyzed} frame(s) analysed
              </p>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {clipResult.status}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-600">{clipResult.notice}</p>

            {clipResult.events.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {clipResult.events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700"
                  >
                    <Camera className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="font-semibold">{event.label || 'item'}</span>
                    <span className="text-slate-400">{formatDateTime(event.detected_at)}</span>
                    <span className="ml-auto tabular-nums">{Math.round((event.confidence || 0) * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-2 text-[11px] text-slate-400">{clipResult.methodology}</p>
            {clipResult.evidenceRecorded > 0 && (
              <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                {clipResult.evidenceRecorded} reference(s) written to the report&apos;s camera log.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card-surface mt-6 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <ShieldQuestion className="h-5 w-5 text-brand-600" /> How a camera request is supposed to work
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              step: '1',
              title: 'The owner consents',
              body: 'Camera lookups are only ever made for footage the person who owns the item has agreed to share. Staff can never browse a feed on their own initiative.'
            },
            {
              step: '2',
              title: 'The organization authorises it',
              body: `This organization currently has camera requests ${camerasAllowed ? 'enabled' : 'disabled'}. That switch lives in organization settings and is enforced per request.`
            },
            {
              step: '3',
              title: 'A provider handles the footage',
              body: 'A connected camera provider pulls the clip, applies its own retention policy, and returns a short-lived reference. That provider layer is the piece missing from this build.'
            }
          ].map((item) => (
            <li key={item.step} className="rounded-xl bg-slate-50 p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {item.step}
              </span>
              <p className="mt-3 text-sm font-bold text-slate-800">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
