import { useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  MapPin, Calendar, Clock, Sparkles, ShieldCheck, PackageCheck, Trash2, RefreshCw,
  ArrowLeft, Tag, Palette, Ruler, Hash, Type, Info, ScanLine, Camera, ImagePlus, Loader2
} from 'lucide-react';
import { useReport, useAddReportImage, useRemoveReportImage } from '../lib/queries';
import { useOrganization } from '../context/OrganizationContext';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import Timeline from '../components/Timeline';
import ErrorState from '../components/ErrorState';
import { ConfirmDialog, useToast } from '../components/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ItemThumb } from '../components/ItemThumb';
import {
  formatDate, formatDateTime, itemName, scoreTone, statusLabel, RECOVERY_STAGES
} from '../lib/format';
import { cn } from '../lib/cn';

/** Recovery stage -> the report statuses that satisfy it. */
const STAGE_STATUS = {
  REPORTED: ['REPORTED', 'MATCHING'],
  POTENTIAL_MATCH: ['POTENTIAL_MATCH', 'MATCHED'],
  VERIFICATION_PENDING: ['VERIFICATION_PENDING', 'VERIFIED'],
  RETURN_READY: ['RETURN_READY'],
  RETURNED: ['RETURNED', 'CLOSED']
};

/*
 * The server's upload rules, mirrored so a bad pick is refused instantly instead
 * of after a round trip. These are not the enforcement point — the multer
 * middleware and the magic-byte check in the report service are.
 */
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
const ACCEPTED_IMAGE_LABEL = 'JPG, PNG or WebP';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ITEM_PHOTOS = 6;

function buildTimeline(report) {
  const history = report.statusHistory || [];
  const first = history[0]?.at || report.createdAt;
  return RECOVERY_STAGES.map((stage) => {
    const entry = history.find(h => h.to === stage.key);
    const reached = STAGE_STATUS[stage.key]?.includes(report.status);
    return {
      label: stage.label,
      state: reached ? (stage.key === 'RETURNED' && report.status === 'RETURNED' ? 'current' : 'done') : 'upcoming',
      at: entry?.at || (reached ? report.updatedAt || report.createdAt : null),
      detail: entry?.note || null
    };
  });
}

function ProfileField({ icon: Icon, label, value, ai }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Icon className="h-3 w-3" /> {label}
        {ai && <span className="rounded bg-violet-100 px-1 text-[9px] text-violet-700">AI</span>}
      </p>
      <p className="mt-0.5 text-sm font-semibold capitalize text-slate-800">{value}</p>
    </div>
  );
}

/**
 * The item's cover photo, plus the controls that let the person who filed the
 * report put THEIR OWN picture of the item on it.
 *
 * `ItemThumb` stays the one place that knows how a report picture renders (lazy
 * loading, gradient fallback, broken-image guard) — this only adds the upload
 * affordance and says honestly which photo the rest of the app will show. The
 * newest photo becomes the cover, because `itemImage()` reads `images[0]`.
 */
function ItemPhoto({ report, canEdit, busy, onPick, onRemove }) {
  const photos = (report.images || []).filter(Boolean);

  if (!canEdit) {
    return (
      <ItemThumb report={report} className="h-52 w-full sm:h-full" rounded="" iconClass="h-16 w-16" />
    );
  }

  return (
    <div className="relative h-52 w-full sm:h-full">
      <ItemThumb report={report} className="h-full w-full" rounded="" iconClass="h-16 w-16" />

      {/* No photo yet: the empty frame is the button, so there is nothing to hunt for. */}
      {photos.length === 0 ? (
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/85 px-4 text-slate-500 transition hover:border-brand-400 hover:bg-white hover:text-brand-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
          <span className="text-xs font-bold">{busy ? 'Adding your photo…' : 'Add your photo'}</span>
          <span className="text-center text-[10px] leading-snug text-slate-400">
            {ACCEPTED_IMAGE_LABEL}, up to {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB. It becomes the
            photo staff check against the item.
          </span>
        </button>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-slate-900/85 to-transparent px-3 pb-3 pt-10">
          <Button size="sm" variant="secondary" onClick={onPick} loading={busy} className="bg-white/90 hover:bg-white">
            <Camera className="h-3.5 w-3.5" /> Add photo
          </Button>
          <Button size="sm" variant="secondary" onClick={onRemove} disabled={busy} className="bg-white/90 hover:bg-white">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
          <span className="ml-auto rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {photos.length} of {MAX_ITEM_PHOTOS}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeOrganizationId, role, isManager } = useOrganization();
  const { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rematching, setRematching] = useState(false);

  const { data, isLoading, isError, error, refetch } = useReport(activeOrganizationId, id);

  // Photo add/remove go through the query layer, so a new cover refreshes every
  // list, the match cards and the dashboard at once rather than just this page.
  const addPhoto = useAddReportImage(activeOrganizationId);
  const removePhoto = useRemoveReportImage(activeOrganizationId);
  const photoInputRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="Report" />
        <ErrorState error={error} onRetry={refetch} title="We couldn't load this report" />
      </div>
    );
  }

  const { report, matches = [], returnCase, verifications = [], owner, canManage, canAuthorizeReturn } = data;
  const profile = report.itemProfile || {};
  const aiFields = new Set(profile.aiFields || []);
  const isLost = report.type === 'LOST';
  const openMatch = matches.find(m => ['PENDING_VERIFICATION', 'MANUAL_REVIEW', 'PENDING', 'VERIFICATION_PENDING'].includes(m.status));
  const pendingVerification = verifications.find(v => v.status === 'PENDING');

  const onDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteReport(report.id);
      toast.success('Report deleted');
      qc.invalidateQueries({ queryKey: ['reports', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['dashboard', activeOrganizationId] });
      navigate('/recovery?tab=cases', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const onRematch = async () => {
    setRematching(true);
    try {
      const res = await api.rematch(report.id);
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['matches', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['report', activeOrganizationId, report.id] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRematching(false);
    }
  };

  const onPickPhoto = () => photoInputRef.current?.click();

  /**
   * Sends the picked file to this report. The server keeps the bytes, prepends
   * the photo so it becomes the cover, and re-runs matching against it.
   */
  const onPhotoChosen = async (event) => {
    const file = event.target.files?.[0];
    // Cleared first, so re-picking the same file still fires a change event.
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.split(',').includes(file.type)) {
      toast.error(`Unsupported file. Add a ${ACCEPTED_IMAGE_LABEL} image.`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`);
      return;
    }

    setPhotoBusy(true);
    try {
      const res = await addPhoto.mutateAsync({ reportId: report.id, file });
      toast.success(res.message || 'Photo added to this item');
    } catch (err) {
      toast.error(err.message || 'That photo could not be uploaded');
    } finally {
      setPhotoBusy(false);
    }
  };

  const onRemovePhoto = async () => {
    const cover = (report.images || []).find(Boolean);
    if (!cover) return;

    setPhotoBusy(true);
    try {
      const res = await removePhoto.mutateAsync({ reportId: report.id, url: cover });
      toast.success(res.message || 'Photo removed from this item');
    } catch (err) {
      toast.error(err.message || 'That photo could not be removed');
    } finally {
      setPhotoBusy(false);
    }
  };

  // This page is reached from both the member report list and the organization
  // queues, so the way back has to follow the viewer's actual context.
  const backTo = isManager ? '/organization/recovery?tab=reports' : '/recovery?tab=cases';
  const backLabel = isManager ? 'Back to Lost & Found' : 'Back to My Reports';

  return (
    <div className="stagger">
      <button onClick={() => navigate(backTo)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>

      <PageHeader
        title={itemName(report)}
        subtitle={`${isLost ? 'Lost' : 'Found'} at ${report.location} · reported ${formatDate(report.createdAt)} · ${report.reference}`}
        badge={<StatusBadge status={report.status} />}
        actions={(
          <>
            {canManage && (
              <Button variant="secondary" size="sm" onClick={onRematch} loading={rematching}>
                <RefreshCw className="h-4 w-4" /> Re-run matching
              </Button>
            )}
            {canManage && (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Item overview */}
          <Card padding="none" className="overflow-hidden">
            <div className="grid gap-0 sm:grid-cols-[220px_1fr]">
              <div className="bg-slate-50">
                <ItemPhoto
                  report={report}
                  canEdit={canManage}
                  busy={photoBusy}
                  onPick={onPickPhoto}
                  onRemove={onRemovePhoto}
                />
                {/* Kept out of the visible controls so the frame itself is the button. */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  className="hidden"
                  onChange={onPhotoChosen}
                />
              </div>
              <div className="p-5">
                <h2 className="text-sm font-bold text-slate-900">Item profile</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{report.description}</p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-slate-500"><MapPin className="h-4 w-4 text-slate-400" /><span className="truncate">{report.location}</span></div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span>{formatDateTime(isLost ? report.lostAt : report.foundAt)}</span>
                  </div>
                  {owner && (
                    <div className="flex items-center gap-2 text-slate-500 sm:col-span-2">
                      <Info className="h-4 w-4 text-slate-400" />
                      <span>Reported by <span className="font-semibold text-slate-700">{owner.name}</span></span>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </Card>

          {/* AI-extracted attributes */}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Item attributes</h2>
              {profile.analysisVersion && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                  {profile.analysisVersion.startsWith('vision') ? 'Vision model' : 'Metadata analysis'}
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ProfileField icon={Tag} label="Category" value={profile.category || report.category} ai={aiFields.has('category')} />
              <ProfileField icon={Type} label="Item name" value={profile.itemName} ai={aiFields.has('category')} />
              <ProfileField icon={Palette} label="Primary colour" value={profile.primaryColor} ai={aiFields.has('primaryColor')} />
              <ProfileField icon={Palette} label="Secondary colour" value={profile.secondaryColor} ai={aiFields.has('secondaryColor')} />
              <ProfileField icon={Tag} label="Brand" value={profile.brand} ai={aiFields.has('brand')} />
              <ProfileField icon={Hash} label="Model" value={profile.model} ai={aiFields.has('model')} />
              <ProfileField icon={Ruler} label="Material" value={profile.material} ai={aiFields.has('material')} />
              <ProfileField icon={ScanLine} label="Shape" value={profile.shape} ai={aiFields.has('shape')} />
              <ProfileField icon={Info} label="Visible mark" value={profile.visibleMark} ai={aiFields.has('visibleMark')} />
              <ProfileField icon={Ruler} label="Size" value={profile.size} ai={aiFields.has('size')} />
              {!isLost && <ProfileField icon={Info} label="Condition" value={profile.condition} ai={aiFields.has('condition')} />}
              <ProfileField icon={Hash} label="Serial number" value={profile.serialNumber} />
              <ProfileField icon={ScanLine} label="OCR text" value={profile.ocrText} ai={aiFields.has('ocrText')} />
            </div>
            {!isLost && profile.finderNotes && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Finder notes</p>
                <p className="mt-0.5 text-sm text-slate-700">{profile.finderNotes}</p>
              </div>
            )}
            {report.lastSeen && (report.lastSeen.location || report.lastSeen.landmark || report.lastSeen.notes) && (
              <div className="mt-4 rounded-xl bg-amber-50/70 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Last seen</p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {report.lastSeen.location || report.lastSeen.landmark}
                  {report.lastSeen.time ? ` · ${report.lastSeen.time}` : ''}
                  {report.lastSeen.notes ? ` — ${report.lastSeen.notes}` : ''}
                </p>
              </div>
            )}
          </Card>

          {/* Matches */}
          <Card padding="none">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Potential matches</h2>
              <span className="text-xs text-slate-400">{matches.length} candidate{matches.length === 1 ? '' : 's'}</span>
            </div>
            {matches.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No candidates yet. LostLink AI searches automatically when new items are reported — you can also re-run matching.
              </p>
            ) : (
              <div className="divide-y divide-slate-50">
                {matches.map(m => (
                  <Link key={m.id} to={`/ai-matches/${m.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50">
                    <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold',
                      scoreTone(m.finalScore) === 'success' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700')}>
                      {Math.round(m.finalScore)}%
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-800">{statusLabel(m.status)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {(m.evidence || []).slice(0, 3).map(e => e.label).join(' · ') || 'No evidence recorded'}
                      </span>
                    </span>
                    <StatusBadge status={m.status} />
                  </Link>
                ))}
              </div>
            )}
            {openMatch && isLost && report.userId === user?.id && !pendingVerification && (
              <div className="border-t border-slate-100 px-5 py-3.5">
                <Button size="sm" onClick={() => navigate(`/ai-matches/${openMatch.id}/verify`)}>
                  <ShieldCheck className="h-4 w-4" /> Start ownership verification
                </Button>
              </div>
            )}
            {pendingVerification && (
              <div className="border-t border-slate-100 bg-amber-50/50 px-5 py-3.5">
                <p className="text-sm font-semibold text-amber-800">Ownership verification in progress</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Attempt {pendingVerification.attempts || 0} of {pendingVerification.maxAttempts || 3}.{' '}
                  <Link to={`/ai-matches/${pendingVerification.matchId}/verify`} className="font-bold underline">Continue verification →</Link>
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-bold text-slate-900">Recovery timeline</h2>
            <div className="mt-4">
              <Timeline steps={buildTimeline(report)} />
            </div>
          </Card>

          {returnCase && (
            <Card>
              <div className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-bold text-slate-900">Return</h2>
              </div>
              <p className="mt-3 text-sm text-slate-600">Status: <StatusBadge status={returnCase.status} /></p>
              {returnCase.pickupLocation && (
                <p className="mt-2 text-sm text-slate-600">Pickup: <span className="font-semibold text-slate-800">{returnCase.pickupLocation}</span></p>
              )}
              <Button size="sm" className="mt-4 w-full" onClick={() => navigate('/recovery?tab=returns')}>
                Track return
              </Button>
            </Card>
          )}

          {canAuthorizeReturn && report.userId !== user?.id && ['VERIFIED'].includes(report.status) && (
            <Card>
              <h2 className="text-sm font-bold text-slate-900">Staff action</h2>
              <p className="mt-1 text-xs text-slate-500">Ownership verified — authorise the secure handover.</p>
              <Button
                size="sm"
                className="mt-3 w-full"
                onClick={async () => {
                  try {
                    await api.createReturnAuthorization(report.id, {});
                    toast.success('Return authorised');
                    refetch();
                    qc.invalidateQueries({ queryKey: ['returns', activeOrganizationId] });
                  } catch (err) { toast.error(err.message); }
                }}
              >
                Authorise return
              </Button>
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-bold text-slate-900">Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Reference</dt><dd className="font-mono text-xs text-slate-700">{report.reference || report.id}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Type</dt><dd className="font-semibold text-slate-700">{isLost ? 'Lost' : 'Found'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Category</dt><dd className="font-semibold text-slate-700">{report.category}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Created</dt><dd className="text-slate-700">{formatDateTime(report.createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Updated</dt><dd className="text-slate-700">{formatDateTime(report.updatedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Your role</dt><dd className="capitalize text-slate-700">{role}</dd></div>
            </dl>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title="Delete this report?"
        description="The report and its match history will be removed permanently."
        confirmLabel="Delete report"
        loading={deleting}
      />
    </div>
  );
}
