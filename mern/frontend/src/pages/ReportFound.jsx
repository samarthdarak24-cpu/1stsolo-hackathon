import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CloudUpload,
  Crosshair,
  ImagePlus,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  PackagePlus,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2
} from 'lucide-react';
import api from '../lib/api';
import { useCreateReport } from '../lib/queries';
import { useOrganization } from '../context/OrganizationContext';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import ErrorState from '../components/ErrorState';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import CategoryTiles from '../components/ui/CategoryTiles';
import { cn } from '../lib/cn';
import { formatDateTime, relativeTime, toInputDateTime } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Report type + static configuration                                  */
/* ------------------------------------------------------------------ */

const REPORT_TYPE = 'FOUND';
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';
const ACCEPTED_LABEL = 'JPG, PNG or WebP';
const MAX_BYTES = 5 * 1024 * 1024; // matches the server upload limit

const CONDITION_OPTIONS = ['New', 'Like new', 'Good', 'Fair', 'Damaged'];

const AI_STAGES = [
  'Detecting object',
  'Extracting attributes',
  'Generating embedding',
  'Searching matches'
];

const PROFILE_FIELDS = [
  { key: 'primaryColor', label: 'Primary colour', placeholder: 'e.g. Navy blue' },
  { key: 'secondaryColor', label: 'Secondary colour', placeholder: 'e.g. Grey trim' },
  { key: 'brand', label: 'Brand', placeholder: 'e.g. Wildcraft' },
  { key: 'model', label: 'Model', placeholder: 'e.g. Hype 30L' },
  { key: 'material', label: 'Material', placeholder: 'e.g. Polyester' },
  { key: 'shape', label: 'Shape', placeholder: 'e.g. Rectangular' },
  { key: 'size', label: 'Size', placeholder: 'e.g. Medium' },
  {
    key: 'visibleMark',
    label: 'Visible mark',
    placeholder: 'e.g. Name tag reading "A. Menon"',
    wide: true,
    hint: 'Mark, logo or sticker on the item. Ownership verification asks the claimant about this.'
  },
  {
    key: 'ocrText',
    label: 'Text on the item',
    placeholder: 'e.g. "SECURITY DESK, BLOCK B"',
    wide: true,
    hint: 'Only text that is literally readable in your photo.'
  },
  { key: 'serialNumber', label: 'Serial number', placeholder: 'e.g. SN-88213 (optional)' }
];

const STEPS = [
  { id: 'photo', title: 'Photo' },
  { id: 'scan', title: 'AI scan' },
  { id: 'details', title: 'Item details' },
  { id: 'review', title: 'Review' }
];

/*
 * Autosave. Same contract as the lost-item wizard: text only, per organization,
 * cleared on submit. The chosen photo is a File and is deliberately not stored.
 */
const DRAFT_VERSION = 1;
const draftKey = (orgId) => `lostlink:report-draft:${orgId || 'default'}:FOUND`;

function readDraft(orgId) {
  try {
    const raw = window.localStorage.getItem(draftKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.v === DRAFT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function dropDraft(orgId) {
  try { window.localStorage.removeItem(draftKey(orgId)); } catch { /* ignore */ }
}

const EMPTY_PROFILE = PROFILE_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {});
const LAST_INDEX = STEPS.length - 1;

/* ------------------------------------------------------------------ */
/* Validation helpers                                                   */
/* ------------------------------------------------------------------ */

function validateDetails(details) {
  const errors = {};
  if (details.itemName.trim().length < 2) errors.itemName = 'Give the item a short name (at least 2 characters).';
  if (!details.category) errors.category = 'Pick the category that fits the item best.';
  if (details.description.trim().length < 10) {
    errors.description = 'Add at least 10 characters — specific detail is what makes a match possible.';
  }
  if (!details.location.trim()) errors.location = 'Tell us where you found it.';
  if (!details.occurredAt) errors.occurredAt = 'When did you find it?';
  if (!details.condition) errors.condition = 'Tell staff how much use it has had.';
  return errors;
}

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/* ------------------------------------------------------------------ */
/* Local UI atoms                                                       */
/* ------------------------------------------------------------------ */

const inputBase = 'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-4';
const inputCls = (invalid) => cn(
  inputBase,
  invalid ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'
);

function Field({ id, label, required, ai, error, hint, children, className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
        <span>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {ai && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-accent-600">
            <Wand2 className="h-2.5 w-2.5" /> AI
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
          <TriangleAlert className="h-3 w-3 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

function Stepper({ steps, current, onSelect }) {
  const count = steps.length;
  const inset = 50 / count;
  return (
    <div className="relative">
      <span aria-hidden="true" className="absolute top-4 h-0.5 rounded-full bg-slate-200" style={{ left: `${inset}%`, right: `${inset}%` }} />
      <span
        aria-hidden="true"
        className="absolute top-4 h-0.5 rounded-full bg-brand-400 transition-all duration-300"
        style={{ left: `${inset}%`, width: `${(current / count) * 100}%` }}
      />
      <ol className="relative flex">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <button
                type="button"
                onClick={done ? () => onSelect(i) : undefined}
                disabled={!done}
                aria-current={active ? 'step' : undefined}
                title={step.title}
                className={cn(
                  'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-extrabold transition',
                  done && 'cursor-pointer border-brand-600 bg-brand-600 text-white hover:bg-brand-700',
                  active && 'border-brand-600 bg-white text-brand-600 ring-4 ring-brand-100',
                  !done && !active && 'border-slate-200 bg-white text-slate-400'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </button>
              <span className={cn('max-w-full truncate text-[11px] font-bold', done || active ? 'text-slate-700' : 'text-slate-400')}>
                {step.title}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepHeading({ title, subtitle }) {
  return (
    <div>
      <h2 className="text-lg font-extrabold tracking-tight text-brand-ink">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p>
    </div>
  );
}

function Dropzone({ dragging, onDragState, onBrowse, onFile }) {
  const depth = useRef(0);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onBrowse}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBrowse();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        onDragState(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) onDragState(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        onDragState(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) onFile(file);
      }}
      className={cn(
        'group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition',
        dragging ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-slate-50/60 hover:bg-brand-50/40'
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-soft transition group-hover:text-brand-600">
        {dragging ? <ImagePlus className="h-6 w-6 animate-pulse" /> : <CloudUpload className="h-6 w-6" />}
      </div>
      <p className="mt-4 text-sm font-bold text-slate-800">{dragging ? 'Drop it here' : 'Drop the item photo here'}</p>
      <p className="mt-1 text-sm text-slate-500">or click to browse</p>
      <p className="mt-3 text-xs text-slate-400">{ACCEPTED_LABEL} · up to {Math.round(MAX_BYTES / (1024 * 1024))} MB</p>
    </div>
  );
}

function ImagePreview({ src, alt, onRemove, onReplace, busy }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-50 shadow-soft">
      <img src={src} alt={alt} className="h-64 w-full object-cover sm:h-80" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-900/85 to-transparent px-4 pb-3 pt-10">
        <span className="truncate text-xs font-semibold text-white/90">{alt}</span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="secondary" onClick={onReplace} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5" /> Replace
          </Button>
          <Button size="sm" variant="secondary" onClick={onRemove} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

function AIPanel({ stages, stageIndex, done, error, onRetry }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-accent-50/70 via-white to-brand-50/60 p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-accent-600 shadow-soft">
          {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : (
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }} className="flex">
              <Sparkles className="h-5 w-5" />
            </motion.span>
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-brand-ink">
            {error ? 'Analysis failed' : done ? 'Item analysed' : 'LostLink AI is reading your photo'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {error
              ? 'Your photo is still attached — retry, or keep going and fill the fields in yourself.'
              : done
                ? 'Review the detected attributes and correct anything that looks wrong.'
                : 'This usually takes a couple of seconds. You can keep this page open.'}
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {stages.map((label, i) => {
          const state = done || i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'upcoming';
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition',
                  state === 'done' && 'border-emerald-200 bg-emerald-50 text-emerald-600',
                  state === 'active' && 'border-accent-200 bg-white text-accent-600',
                  state === 'upcoming' && 'border-slate-200 bg-white text-slate-300'
                )}
              >
                {state === 'done'
                  ? <Check className="h-3.5 w-3.5" />
                  : state === 'active'
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : i + 1}
              </span>
              <span className={cn('text-sm font-semibold transition', state === 'upcoming' ? 'text-slate-400' : 'text-slate-700')}>
                {label}
              </span>
              {state === 'active' && <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-accent-600">working</span>}
            </li>
          );
        })}
      </ul>

      {error && (
        <div className="mt-4">
          <ErrorState error={error} onRetry={onRetry} compact title="Could not analyse this image" />
        </div>
      )}
    </div>
  );
}

function InfoBanner({ children, tone = 'info' }) {
  const tones = {
    info: 'border-accent-100 bg-accent-50/70 text-accent-700',
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
    warning: 'border-amber-200 bg-amber-50/70 text-amber-800'
  };
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-relaxed', tones[tone])}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p className="min-w-0 flex-1">{children}</p>
    </div>
  );
}

function AIProfileEditor({ profile, aiFields, onChange }) {
  const aiSet = useMemo(() => new Set(aiFields || []), [aiFields]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PROFILE_FIELDS.map((field) => {
        const id = `profile-${field.key}`;
        return (
          <Field
            key={field.key}
            id={id}
            label={field.label}
            ai={aiSet.has(field.key)}
            hint={field.hint}
            className={field.wide ? 'sm:col-span-2' : undefined}
          >
            <input
              id={id}
              type="text"
              value={profile[field.key] || ''}
              placeholder={field.placeholder}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={inputCls(false)}
            />
          </Field>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value }) {
  const hasValue = value !== null && value !== undefined && String(value).trim() !== '';
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={cn('min-w-0 whitespace-pre-wrap break-words text-right text-sm font-semibold', hasValue ? 'text-slate-800' : 'text-slate-300')}>
        {hasValue ? value : '—'}
      </span>
    </div>
  );
}

function ReviewCard({ imageUrl, details, profile, onEdit }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div>
        {imageUrl ? (
          <img src={imageUrl} alt="The item you found" className="h-56 w-full rounded-2xl object-cover shadow-soft lg:h-72" />
        ) : (
          <div className="flex h-56 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-300 lg:h-72">
            <PackagePlus className="h-10 w-10" />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge status="FOUND" label="Found · handed in" tone="info" />
          {details.condition && <StatusBadge tone="default" label={details.condition} dot={false} />}
          {profile.brand && <StatusBadge tone="default" label={profile.brand} dot={false} />}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-extrabold text-brand-ink">{details.itemName || 'Untitled item'}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {[details.category, details.location].filter(Boolean).join(' · ') || 'No location yet'}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onEdit(2)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>

        <div className="rounded-2xl bg-slate-50/70 px-4 py-2">
          <ReviewRow label="Description" value={details.description} />
          <ReviewRow label="Category" value={details.category} />
          <ReviewRow label="Where you found it" value={details.location} />
          <ReviewRow label="When" value={formatDateTime(details.occurredAt)} />
          <ReviewRow label="Condition" value={details.condition} />
          <ReviewRow label="Finder notes" value={details.finderNotes} />
          <ReviewRow label="Brand" value={profile.brand} />
          <ReviewRow label="Model" value={profile.model} />
          <ReviewRow label="Colours" value={[profile.primaryColor, profile.secondaryColor].filter(Boolean).join(' / ')} />
          <ReviewRow label="Material" value={profile.material} />
          <ReviewRow label="Shape" value={profile.shape} />
          <ReviewRow label="Size" value={profile.size} />
          <ReviewRow label="Visible mark" value={profile.visibleMark} />
          <ReviewRow label="Text on item" value={profile.ocrText} />
          <ReviewRow label="Serial number" value={profile.serialNumber} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function ReportFound() {
  const navigate = useNavigate();
  const toast = useToast();
  const { activeOrganization, activeOrganizationId } = useOrganization();
  const createReport = useCreateReport(activeOrganizationId);

  const draft = useMemo(() => readDraft(activeOrganizationId), [activeOrganizationId]);
  const [step, setStep] = useState(() => Math.min(draft?.step ?? 0, 2));
  const [photo, setPhoto] = useState(null); // { file, previewUrl, name }
  const [photoSkipped, setPhotoSkipped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [profile, setProfile] = useState(() => ({ ...EMPTY_PROFILE, ...(draft?.profile || {}) }));
  const [details, setDetails] = useState(() => ({
    itemName: '',
    category: '',
    description: '',
    location: '',
    occurredAt: toInputDateTime(),
    condition: 'Good',
    finderNotes: '',
    ...(draft?.details || {})
  }));
  const [draftSavedAt, setDraftSavedAt] = useState(() => (draft ? Date.now() : null));
  const [touched, setTouched] = useState({});
  const [geo, setGeo] = useState(null);
  const [locating, setLocating] = useState(false);
  const [created, setCreated] = useState(null);

  const fileInputRef = useRef(null);
  const navigateTimer = useRef(null);

  // Object URLs are preview-only: they must never be sent to the API.
  useEffect(() => {
    const current = photo?.previewUrl;
    return () => { if (current) URL.revokeObjectURL(current); };
  }, [photo?.previewUrl]);

  useEffect(() => () => { if (navigateTimer.current) clearTimeout(navigateTimer.current); }, []);

  // Debounced write. An untouched form clears the draft rather than storing one.
  useEffect(() => {
    if (created) return undefined;
    const timer = setTimeout(() => {
      const untouched = !details.itemName && !details.category && !details.description
        && !details.location && !String(details.finderNotes || '').trim()
        && !Object.values(profile).some((v) => String(v || '').trim());
      if (untouched) {
        dropDraft(activeOrganizationId);
        setDraftSavedAt(null);
        return;
      }
      try {
        window.localStorage.setItem(draftKey(activeOrganizationId), JSON.stringify({
          v: DRAFT_VERSION, step, details, profile
        }));
        setDraftSavedAt(Date.now());
      } catch { /* storage unavailable — keep going */ }
    }, 700);
    return () => clearTimeout(timer);
  }, [created, activeOrganizationId, step, details, profile]);

  const discardDraft = useCallback(() => {
    dropDraft(activeOrganizationId);
    setDraftSavedAt(null);
    setStep(0);
    setProfile(EMPTY_PROFILE);
    setDetails({
      itemName: '', category: '', description: '', location: '',
      occurredAt: toInputDateTime(), condition: 'Good', finderNotes: ''
    });
    setTouched({});
  }, [activeOrganizationId]);

  // The AI stage list keeps ticking while the request is in flight (~2.4s).
  useEffect(() => {
    if (!analyzing) return undefined;
    setStageIndex(0);
    const timer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, AI_STAGES.length - 1));
    }, 600);
    return () => clearInterval(timer);
  }, [analyzing]);

  const detailErrors = useMemo(() => validateDetails(details), [details]);
  const stepErrors = useMemo(() => [{}, {}, detailErrors, {}], [detailErrors]);
  const canContinue = Object.keys(stepErrors[step]).length === 0;

  const touch = useCallback((name) => setTouched((t) => (t[name] ? t : { ...t, [name]: true })), []);

  const gotoStep = useCallback((next) => setStep(Math.min(Math.max(next, 0), LAST_INDEX)), []);

  const runAnalysis = useCallback(async (file) => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setStageIndex(0);
    try {
      const response = await api.analyzeItem(file, REPORT_TYPE);
      setAnalysis(response);
      const scanned = { ...EMPTY_PROFILE, ...(response?.itemProfile || {}) };
      setProfile(scanned);
      setDetails((d) => ({
        ...d,
        category: d.category || scanned.category || '',
        itemName: d.itemName || scanned.category || '',
        condition: scanned.condition || d.condition
      }));
      setStageIndex(AI_STAGES.length);
      toast.success(response?.message || 'Item analysed');
    } catch (err) {
      setAnalyzeError(err);
    } finally {
      setAnalyzing(false);
    }
  }, [toast]);

  const acceptFile = useCallback((file) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.split(',').includes(file.type)) {
      toast.error(`Unsupported file. Upload ${ACCEPTED_LABEL}.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`);
      return;
    }
    setPhoto({ file, previewUrl: URL.createObjectURL(file), name: file.name });
    setPhotoSkipped(false);
    setAnalysis(null);
    setAnalyzeError(null);
    runAnalysis(file);
  }, [runAnalysis, toast]);

  const removePhoto = useCallback(() => {
    setPhoto(null);
    setAnalysis(null);
    setAnalyzeError(null);
    setPhotoSkipped(false);
  }, []);

  const updateProfile = useCallback((key, value) => setProfile((p) => ({ ...p, [key]: value })), []);

  const updateCategory = useCallback((value) => {
    setProfile((p) => ({ ...p, category: value }));
    setDetails((d) => ({ ...d, category: value }));
    touch('category');
  }, [touch]);

  const updateDetails = useCallback((key, value) => {
    setDetails((d) => ({ ...d, [key]: value }));
    touch(key);
  }, [touch]);

  const captureLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      toast.error('This browser cannot share a location. Type the place instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setGeo({ lat: Number(latitude.toFixed(6)), lng: Number(longitude.toFixed(6)), at: Date.now() });
        setDetails((d) => ({ ...d, location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` }));
        touch('location');
        setLocating(false);
        toast.success('Location captured — replace the coordinates with a place name if you can.');
      },
      (err) => {
        setLocating(false);
        toast.error(err?.message || 'Location permission denied. Type the place instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, [toast, touch]);

  const submit = async () => {
    if (createReport.isPending) return;
    createReport.reset();
    try {
      const response = await createReport.mutateAsync({
        type: REPORT_TYPE,
        payload: {
          // A scan result never contains `null` today, but `profile` is also
          // restored from a localStorage draft, and `JSON.stringify` preserves
          // null. Zod's optional() rejects null but accepts `''`, so the blank
          // form is what goes on the wire.
          itemProfile: {
            itemName: details.itemName.trim(),
            category: details.category,
            primaryColor: profile.primaryColor || '',
            secondaryColor: profile.secondaryColor || '',
            brand: profile.brand || '',
            model: profile.model || '',
            material: profile.material || '',
            shape: profile.shape || '',
            size: profile.size || '',
            visibleMark: profile.visibleMark || '',
            ocrText: profile.ocrText || '',
            serialNumber: profile.serialNumber || '',
            condition: details.condition || '',
            finderNotes: details.finderNotes.trim()
          },
          // The server-hosted URL from the analysis step — never the local blob.
          images: analysis?.imageUrl ? [analysis.imageUrl] : [],
          description: details.description.trim(),
          category: details.category,
          location: details.location.trim(),
          // A pin is optional: omit the key entirely when the map was not used.
          // Sending `{ lat: null, lng: null }` (the old behaviour) reached Zod as
          // an object whose values are null and was rejected — and once the map
          // step is skipped, every found report took that path.
          ...(geo ? { coordinates: { lat: geo.lat, lng: geo.lng } } : {}),
          // Never null: `foundAt` is required, and an empty datetime input would
          // otherwise be serialised as null and rejected outright.
          foundAt: toIso(details.occurredAt) || new Date().toISOString()
        }
      });

      dropDraft(activeOrganizationId);
      setDraftSavedAt(null);

      const result = {
        id: response?.report?.id,
        reference: response?.report?.reference,
        message: response?.message || 'Found item registered successfully'
      };
      setCreated(result);
      toast.success(result.message);
      navigateTimer.current = setTimeout(() => {
        if (result.id) navigate(`/recovery/${result.id}`);
      }, 1500);
    } catch (err) {
      toast.error(err?.message || 'We could not save your report. Please try again.');
    }
  };

  if (created) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-xl font-extrabold text-brand-ink">{created.message}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Thank you. LostLink AI is comparing this item against every open lost report in{' '}
            {activeOrganization?.name || 'your organization'}. If there is a match, the owner is asked to verify ownership before anyone collects it.
          </p>
          {created.reference && (
            <p className="mt-4 inline-block rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-600">
              {created.reference}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => created.id && navigate(`/my-reports/${created.id}`)} disabled={!created.id}>
              Open report <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={() => navigate('/matches')}>
              <Sparkles className="h-4 w-4" /> See AI matches
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Report a found item"
        subtitle={activeOrganization ? `Handing it in to ${activeOrganization.name}` : 'Help get it back to its owner.'}
        badge={<StatusBadge tone="info" label="Guided report" dot={false} icon={Wand2} />}
        actions={(
          // The type chooser above this header already switches forms.
          <Button size="sm" variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
        )}
      />

      <Card padding="md" className="mb-6">
        <Stepper steps={STEPS} current={step} onSelect={gotoStep} />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            {draftSavedAt ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Draft saved {relativeTime(draftSavedAt)} — your text survives a refresh.
              </>
            ) : (
              <>
                <CloudUpload className="h-3.5 w-3.5" />
                Progress saves automatically as you type. Your photo is not kept.
              </>
            )}
          </p>
          {draftSavedAt && (
            <button
              type="button"
              onClick={discardDraft}
              className="text-[11px] font-bold text-slate-400 transition hover:text-red-600"
            >
              Discard draft
            </button>
          )}
        </div>
      </Card>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {/* ---------------- Step 1 — photo ---------------- */}
          {step === 0 && (
            <Card padding="md">
              <StepHeading
                title="Start with a photo"
                subtitle="Photograph the item exactly as you found it. Staff use this image during custody, and it is the strongest signal for matching it to a lost report."
              />
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ''; }}
              />

              <div className="mt-6 space-y-5">
                {photo ? (
                  <>
                    <ImagePreview
                      src={photo.previewUrl}
                      alt={photo.name}
                      busy={analyzing}
                      onRemove={removePhoto}
                      onReplace={() => fileInputRef.current?.click()}
                    />
                    {(analyzing || analysis || analyzeError) && (
                      <AIPanel
                        stages={AI_STAGES}
                        stageIndex={stageIndex}
                        done={!analyzing && Boolean(analysis)}
                        error={analyzeError}
                        onRetry={() => runAnalysis(photo.file)}
                      />
                    )}
                    {analysis?.notice && <InfoBanner>{analysis.notice}</InfoBanner>}
                  </>
                ) : (
                  <>
                    <Dropzone
                      dragging={dragging}
                      onDragState={setDragging}
                      onBrowse={() => fileInputRef.current?.click()}
                      onFile={acceptFile}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">A photo is strongly recommended, but you can report without one.</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setPhotoSkipped(true); gotoStep(1); }}
                      >
                        Continue without a photo
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {/* ---------------- Step 2 — AI scan ---------------- */}
          {step === 1 && (
            <Card padding="md">
              <StepHeading
                title="AI item scan"
                subtitle="Everything the model detected is editable. Correct what is wrong — the matcher only sees what you confirm here."
              />

              <div className="mt-6 space-y-5">
                {analyzing || analysis || analyzeError ? (
                  <AIPanel
                    stages={AI_STAGES}
                    stageIndex={stageIndex}
                    done={!analyzing && Boolean(analysis)}
                    error={analyzeError}
                    onRetry={() => photo?.file && runAnalysis(photo.file)}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center">
                    <ImagePlus className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-bold text-slate-700">
                      {photoSkipped ? 'Continuing without a photo' : 'No photo attached'}
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                      {photoSkipped
                        ? 'You can go back and add one at any point. Without a photo we fall back to the text you type next, so matches will be weaker.'
                        : 'Without a photo we fall back to the details you type next, so matches will be weaker.'}
                    </p>
                    <Button size="sm" variant="secondary" className="mt-4" onClick={() => gotoStep(0)}>
                      <ArrowLeft className="h-3.5 w-3.5" /> Add a photo
                    </Button>
                  </div>
                )}

                {analysis?.notice && <InfoBanner>{analysis.notice}</InfoBanner>}

                {analysis?.analysis && (
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={analysis.analysis.provider === 'vision' ? 'violet' : 'default'}
                      label={`Provider: ${analysis.analysis.provider}${analysis.analysis.model ? ` · ${analysis.analysis.model}` : ''}`}
                      dot={false}
                    />
                    {analysis.analysis.confidence != null && (
                      <StatusBadge tone="default" label={`Confidence ${Math.round(analysis.analysis.confidence * 100)}%`} dot={false} />
                    )}
                    {analysis.analysis.width ? (
                      <StatusBadge
                        tone="default"
                        label={`${analysis.analysis.width}×${analysis.analysis.height} ${analysis.analysis.format || ''}`.trim()}
                        dot={false}
                      />
                    ) : null}
                  </div>
                )}

                <div className="rounded-2xl bg-slate-50/70 p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-extrabold text-brand-ink">Detected item</h3>
                    {analysis?.imageUrl && (
                      <img src={analysis.imageUrl} alt="Uploaded item" className="h-10 w-10 rounded-xl object-cover shadow-soft" />
                    )}
                  </div>
                  <AIProfileEditor
                    profile={profile}
                    aiFields={analysis?.aiFields || analysis?.itemProfile?.aiFields}
                    onChange={updateProfile}
                    onCategoryChange={updateCategory}
                  />
                </div>
              </div>
            </Card>
          )}

          {/* ---------------- Step 3 — found details ---------------- */}
          {step === 2 && (
            <Card padding="md">
              <StepHeading
                title="Where, when and what state it is in"
                subtitle="These details drive the first pass of matching — the matcher weighs text, category, location and time together."
              />

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <CategoryTiles
                    value={details.category}
                    onChange={updateCategory}
                    error={touched.category ? detailErrors.category : undefined}
                  />
                </div>

                <Field id="itemName" label="Item name" required error={touched.itemName ? detailErrors.itemName : undefined}>
                  <input
                    id="itemName"
                    type="text"
                    value={details.itemName}
                    placeholder="e.g. Navy Wildcraft backpack"
                    onChange={(e) => updateDetails('itemName', e.target.value)}
                    onBlur={() => touch('itemName')}
                    className={inputCls(touched.itemName && detailErrors.itemName)}
                  />
                </Field>

                <Field
                  id="description"
                  label="Description"
                  required
                  className="sm:col-span-2"
                  error={touched.description ? detailErrors.description : undefined}
                  hint={`${details.description.trim().length} characters · 10 minimum`}
                >
                  <textarea
                    id="description"
                    rows={4}
                    value={details.description}
                    placeholder="Describe the item, what was inside it, and anything that makes it recognisable."
                    onChange={(e) => updateDetails('description', e.target.value)}
                    onBlur={() => touch('description')}
                    className={cn(inputCls(touched.description && detailErrors.description), 'resize-y')}
                  />
                </Field>

                <Field id="location" label="Where did you find it?" required error={touched.location ? detailErrors.location : undefined}>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                    <input
                      id="location"
                      type="text"
                      value={details.location}
                      placeholder="e.g. Cafeteria, next to the left counter"
                      onChange={(e) => updateDetails('location', e.target.value)}
                      onBlur={() => touch('location')}
                      className={cn(inputCls(touched.location && detailErrors.location), 'pl-9')}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={captureLocation} loading={locating}>
                      <LocateFixed className="h-3.5 w-3.5" />
                      {geo ? 'Use my last known location' : 'Use my current location'}
                    </Button>
                    {geo && <span className="text-[11px] font-semibold text-slate-400">Fix from {formatDateTime(geo.at)}</span>}
                  </div>
                </Field>

                <Field id="occurredAt" label="Date & time found" required error={touched.occurredAt ? detailErrors.occurredAt : undefined}>
                  <input
                    id="occurredAt"
                    type="datetime-local"
                    value={details.occurredAt}
                    onChange={(e) => updateDetails('occurredAt', e.target.value)}
                    onBlur={() => touch('occurredAt')}
                    className={inputCls(touched.occurredAt && detailErrors.occurredAt)}
                  />
                </Field>

                <Field id="condition" label="Condition" required error={touched.condition ? detailErrors.condition : undefined}>
                  <select
                    id="condition"
                    value={details.condition}
                    onChange={(e) => updateDetails('condition', e.target.value)}
                    onBlur={() => touch('condition')}
                    className={cn(inputCls(touched.condition && detailErrors.condition), 'appearance-none pr-8')}
                  >
                    {CONDITION_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </Field>

                <Field
                  id="finderNotes"
                  label="Finder notes"
                  className="sm:col-span-2"
                  hint="What was inside it, where exactly it was lying, who was around. These notes are used to verify the owner, so record everything you saw."
                >
                  <textarea
                    id="finderNotes"
                    rows={3}
                    value={details.finderNotes}
                    placeholder="e.g. Inside there was a lab notebook with 'PHY 204' written on the cover and a red lanyard."
                    onChange={(e) => updateDetails('finderNotes', e.target.value)}
                    className={cn(inputCls(false), 'resize-y')}
                  />
                </Field>
              </div>
            </Card>
          )}

          {/* ---------------- Step 4 — review & confirm ---------------- */}
          {step === 3 && (
            <Card padding="md">
              <StepHeading
                title="Review & confirm"
                subtitle="Check the card below. Once submitted, LostLink AI starts comparing this item with every open lost report in your organization."
              />

              <div className="mt-6">
                <ReviewCard
                  imageUrl={analysis?.imageUrl}
                  details={details}
                  profile={profile}
                  onEdit={gotoStep}
                />
              </div>

              {analyzing && (
                <div className="mt-5">
                  <InfoBanner tone="neutral">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Waiting for the item analysis to finish so the image is attached…
                    </span>
                  </InfoBanner>
                </div>
              )}

              {createReport.error && (
                <div className="mt-5">
                  <ErrorState
                    error={createReport.error}
                    compact
                    onRetry={submit}
                    title="We could not save your report"
                  />
                </div>
              )}
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ---------------- sticky step navigation ---------------- */}
      <div className="sticky bottom-20 z-20 mt-6 lg:bottom-4">
        <Card padding="sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => gotoStep(step - 1)}
              disabled={step === 0 || createReport.isPending}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>

            <p className="order-last w-full text-center text-xs font-semibold text-slate-400 sm:order-none sm:w-auto">
              Step {step + 1} of {STEPS.length}
              {step > 0 && step < LAST_INDEX && !canContinue ? ' · finish the highlighted fields to continue' : ''}
            </p>

            {step < LAST_INDEX ? (
              <Button onClick={() => gotoStep(step + 1)} disabled={!canContinue}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} loading={createReport.isPending} disabled={!canContinue || analyzing}>
                <Crosshair className="h-4 w-4" /> Submit found report
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
