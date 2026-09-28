import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Check, Building2, GraduationCap, Stethoscope,
  School, Landmark, HeartHandshake, MapPin, Bell, Camera
} from 'lucide-react';
import Logo from '../components/Logo';
import OrgMark from '../components/OrgMark';
import { Button } from '../components/ui/Button';
import { StageCard, FieldActions, LogoPicker, Toggle } from './organization/CreateOrganizationParts';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import api from '../lib/api';
import { cn } from '../lib/cn';

/**
 * CreateOrganization — the tenant onboarding wizard.
 *
 * Spec flow: Create → Name → Type → Logo → Location → Admin → Customize →
 * Finish. Six linear steps, one question group each, because a new administrator
 * abandons a 20-field page but finishes a wizard.
 *
 * Everything collected here is real: name / type / domain / location go to
 * `POST /api/organizations/create`, the logo is downscaled in the browser and
 * stored on `organization.logoUrl`, and the portal options are the organization's
 * own settings document (`PATCH /api/organizations/:id/settings`) — the same
 * settings the staff portal reads. Nothing here is decorative.
 */

const ORG_TYPES = [
  { value: 'school', label: 'School', icon: School, hint: 'K-12 front office' },
  { value: 'college', label: 'College', icon: GraduationCap, hint: 'Campus & dorms' },
  { value: 'company', label: 'Company', icon: Building2, hint: 'Facilities desk' },
  { value: 'hospital', label: 'Hospital', icon: Stethoscope, hint: 'Custody desk' },
  { value: 'event', label: 'Event', icon: HeartHandshake, hint: 'Time-boxed venue' },
  { value: 'other', label: 'Other', icon: Landmark, hint: 'Anything else' }
];

const STEPS = [
  { id: 'identity', label: 'Identity' },
  { id: 'brand', label: 'Branding' },
  { id: 'place', label: 'Location' },
  { id: 'portal', label: 'Portal' },
  { id: 'review', label: 'Review' }
];

export default function CreateOrganization() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, createOrg, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    type: 'school',
    emailDomain: (user?.email || '').split('@')[1] || '',
    location: '',
    logoUrl: '',
    pickupLocation: 'Security Desk',
    instructions: 'Present your one-time QR code and confirm your identity.',
    requireVerification: true,
    allowCctvRequests: false,
    matchAlerts: true,
    verificationAlerts: true,
    returnAlerts: true
  });

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const isLast = step === STEPS.length - 1;

  /** Step gate: only the identity step is genuinely required. */
  const canAdvance = useMemo(() => {
    if (STEPS[step].id === 'identity') return form.name.trim().length >= 3 && form.emailDomain.trim().length >= 3;
    return true;
  }, [step, form]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      // 1. The tenant itself. The API derives the owner from the session, so the
      //    caller automatically becomes OWNER of what they just created.
      const result = await createOrg({
        name: form.name.trim(),
        type: form.type,
        emailDomain: form.emailDomain.trim().replace(/^@/, ''),
        location: form.location.trim()
      });

      const orgId = result?.activeOrganization?.id
        || (result?.organizations || []).slice(-1)[0]?.id
        || result?.user?.activeOrgId;

      // 2. Branding and portal policy are follow-up writes, so a failure in
      //    either must not undo a successfully created organization.
      if (orgId) {
        if (form.logoUrl) {
          try {
            await api.updateOrg(orgId, { logoUrl: form.logoUrl });
          } catch {
            toast.info('Organization created — the logo could not be saved.');
          }
        }
        try {
          await api.updateOrgSettings(orgId, {
            pickupLocation: form.pickupLocation.trim() || 'Security Desk',
            instructions: form.instructions.trim(),
            requireVerification: form.requireVerification,
            allowCctvRequests: form.allowCctvRequests,
            matchAlerts: form.matchAlerts,
            verificationAlerts: form.verificationAlerts,
            returnAlerts: form.returnAlerts
          });
        } catch {
          toast.info('Organization created — defaults were kept for the portal options.');
        }
        await refresh();
      }

      setCreated(result?.activeOrganization || { name: form.name, logoUrl: form.logoUrl });
      toast.success(`${form.name} is ready`);
    } catch (err) {
      setError(err.message || 'The organization could not be created');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-surface min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-2.5">
          <Logo />
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          Cancel
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20">
        {created ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl bg-white p-8 text-center shadow-card"
          >
            <span className="mx-auto flex h-16 w-16 animate-pop-in items-center justify-center rounded-full bg-emerald-500 text-white shadow-glow">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <div className="mt-5 flex items-center justify-center gap-3">
              <OrgMark organization={created} size="lg" />
              <h1 className="text-2xl font-extrabold tracking-tight text-brand-ink">{created.name}</h1>
            </div>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Your lost &amp; found portal is live. Staff can sign in with your domain, and members can
              report items right away.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate('/organization/overview')}>
                Open the portal <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="secondary" onClick={() => navigate('/organization/people')}>
                Invite your team
              </Button>
            </div>
          </motion.div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-extrabold tracking-tight text-brand-ink sm:text-3xl">
                Create your organization
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                A private lost &amp; found portal in five short steps.
              </p>
            </div>

            <WizardProgress steps={STEPS} current={step} onJump={(i) => i < step && setStep(i)} />

            <div className="mt-6">
              {STEPS[step].id === 'identity' && <IdentityStep form={form} set={set} />}
              {STEPS[step].id === 'brand' && <BrandStep form={form} set={set} />}
              {STEPS[step].id === 'place' && <PlaceStep form={form} set={set} />}
              {STEPS[step].id === 'portal' && <PortalStep form={form} set={set} />}
              {STEPS[step].id === 'review' && <ReviewStep form={form} user={user} />}
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700">{error}</p>
            )}

            <FieldActions>
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="ghost" onClick={back} disabled={step === 0}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                {isLast ? (
                  <Button onClick={submit} loading={saving} size="lg">
                    Create organization
                  </Button>
                ) : (
                  <Button onClick={next} disabled={!canAdvance} size="lg">
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </FieldActions>
          </>
        )}
      </main>
    </div>
  );
}

function WizardProgress({ steps, current, onJump }) {
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} className="flex flex-1 flex-col gap-1.5">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={i > current}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'h-1.5 w-full rounded-full transition-colors',
                done ? 'bg-brand-600' : active ? 'bg-brand-400' : 'bg-slate-200'
              )}
              aria-label={s.label}
            />
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-wider',
              active ? 'text-brand-600' : done ? 'text-slate-500' : 'text-slate-300'
            )}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function IdentityStep({ form, set }) {
  return (
    <StageCard
      title="What is this organization called?"
      hint="Members see this name everywhere — on reports, emails and the portal."
    >
      <label className="block">
        <span className="field-label">Organization name</span>
        <input
          className="input-base text-base"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="ABC School"
          autoFocus
        />
      </label>

      <div>
        <span className="field-label">Type</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ORG_TYPES.map((t) => {
            const Icon = t.icon;
            const active = form.type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => set({ type: t.value })}
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-3 text-left transition',
                  active
                    ? 'bg-brand-50 ring-2 ring-brand-400'
                    : 'bg-slate-50 hover:bg-slate-100'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-slate-400')} />
                <span className="min-w-0">
                  <span className={cn('block truncate text-[13px] font-bold', active ? 'text-brand-800' : 'text-slate-700')}>
                    {t.label}
                  </span>
                  <span className="block truncate text-[10px] text-slate-400">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className="field-label">Email domain</span>
        <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-xs focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
          <span className="pl-3.5 text-sm font-bold text-slate-400">@</span>
          <input
            className="w-full rounded-xl bg-transparent px-2 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            value={form.emailDomain}
            onChange={(e) => set({ emailDomain: e.target.value })}
            placeholder="abcschool.com"
          />
        </div>
        <p className="field-hint">
          Anyone signing up with this domain joins automatically. Staff you invite get the roles you assign.
        </p>
      </label>
    </StageCard>
  );
}

function BrandStep({ form, set }) {
  return (
    <StageCard
      title="Add your mark"
      hint="Optional. Shown in the sidebar, the portal header and the organization switcher."
    >
      <LogoPicker value={form.logoUrl} onChange={(url) => set({ logoUrl: url })} name={form.name} />
    </StageCard>
  );
}

function PlaceStep({ form, set }) {
  return (
    <StageCard
      title="Where do items get handed back?"
      hint="Members see this when an item is ready for pickup."
    >
      <label className="block">
        <span className="field-label">Location</span>
        <input
          className="input-base"
          value={form.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="Pune, Maharashtra"
        />
      </label>
      <label className="block">
        <span className="field-label">Default pickup point</span>
        <input
          className="input-base"
          value={form.pickupLocation}
          onChange={(e) => set({ pickupLocation: e.target.value })}
          placeholder="Security Desk"
        />
        <p className="field-hint">Staff can change this per case at handover time.</p>
      </label>
      <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-500">
          Locations are never shared outside your organization. Members only ever see their own reports.
        </p>
      </div>
    </StageCard>
  );
}

function PortalStep({ form, set }) {
  return (
    <StageCard
      title="How should the portal behave?"
      hint="These defaults apply to every member of your organization."
    >
      <div className="space-y-2">
        <Toggle
          icon={Check}
          label="Require ownership verification"
          hint="A claim must pass a private challenge before an item is released."
          checked={form.requireVerification}
          onChange={(v) => set({ requireVerification: v })}
        />
        <Toggle
          icon={Camera}
          label="Allow CCTV analysis requests"
          hint="Staff can ask the AI to search recorded footage for an item."
          checked={form.allowCctvRequests}
          onChange={(v) => set({ allowCctvRequests: v })}
        />
        <Toggle
          icon={Bell}
          label="Match alerts"
          hint="Notify the owner the moment a candidate match appears."
          checked={form.matchAlerts}
          onChange={(v) => set({ matchAlerts: v })}
        />
        <Toggle
          icon={Bell}
          label="Verification alerts"
          hint="Notify staff when a claim needs a decision."
          checked={form.verificationAlerts}
          onChange={(v) => set({ verificationAlerts: v })}
        />
        <Toggle
          icon={Bell}
          label="Return alerts"
          hint="Notify the owner when the item is ready for pickup."
          checked={form.returnAlerts}
          onChange={(v) => set({ returnAlerts: v })}
        />
      </div>

      <label className="block">
        <span className="field-label">Handover instructions</span>
        <textarea
          className="textarea-base"
          rows={2}
          value={form.instructions}
          onChange={(e) => set({ instructions: e.target.value })}
        />
      </label>
    </StageCard>
  );
}

function ReviewStep({ form, user }) {
  const type = ORG_TYPES.find((t) => t.value === form.type);
  const rows = [
    ['Organization', form.name],
    ['Type', type?.label || form.type],
    ['Domain', `@${form.emailDomain.replace(/^@/, '')}`],
    ['Location', form.location || 'Not set'],
    ['Pickup point', form.pickupLocation || 'Security Desk'],
    ['Owner', `${user?.name || 'You'} · ${user?.email || ''}`],
    ['Verification required', form.requireVerification ? 'Yes' : 'No'],
    ['Alerts', [form.matchAlerts && 'matches', form.verificationAlerts && 'verification', form.returnAlerts && 'returns'].filter(Boolean).join(', ') || 'off']
  ];

  return (
    <StageCard title="Ready to launch" hint="You can change every one of these later in People & Settings.">
      <div className="flex items-center gap-3.5 rounded-2xl bg-slate-50 p-4">
        <OrgMark organization={{ name: form.name, logoUrl: form.logoUrl }} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-brand-ink">{form.name || 'Your organization'}</p>
          <p className="truncate text-xs text-slate-500">{type?.label} · @{form.emailDomain || 'your-domain'}</p>
        </div>
      </div>

      <dl className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="truncate text-right text-sm font-semibold text-slate-700">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </StageCard>
  );
}


