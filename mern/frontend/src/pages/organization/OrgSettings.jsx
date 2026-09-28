import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BellRing,
  Building2,
  Copy,
  Info,
  MapPin,
  Save,
  ShieldCheck,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Video
} from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useAuth } from '../../context/AuthContext';
import { useOrgSettings } from '../../lib/queries';
import { LogoPicker } from './CreateOrganizationParts';
import api from '../../lib/api';
import { useToast } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import ErrorState from '../../components/ErrorState';
import { Button } from '../../components/ui/Button';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { formatDate } from '../../lib/format';
import { cn } from '../../lib/cn';

const TOGGLES = [
  { key: 'requireVerification', label: 'Require ownership verification', hint: 'A return can only be authorised after a claimant proves ownership.' },
  { key: 'allowCctvRequests', label: 'Allow camera requests', hint: 'Staff may ask the owner for consent to check camera footage.' },
  { key: 'matchAlerts', label: 'New match alerts', hint: 'Notify members when LostLink AI finds a candidate match.' },
  { key: 'verificationAlerts', label: 'Verification alerts', hint: 'Notify claimants when their ownership check is reviewed.' },
  { key: 'returnAlerts', label: 'Return alerts', hint: 'Notify owners when their item is ready for pickup.' }
];

// Mirrors the API's organization enum — the same list the create wizard offers.
const TYPE_OPTIONS = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College / University' },
  { value: 'company', label: 'Company' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'office', label: 'Office' },
  { value: 'event', label: 'Event' },
  { value: 'campus', label: 'Campus' },
  { value: 'other', label: 'Other' }
];

const fieldClass = 'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400';

const VERIFICATION_TONES = {
  verified: 'success',
  pending: 'warning',
  rejected: 'danger'
};

/**
 * OrgSettings — the real settings form plus a read-only identity panel.
 * Endpoints: GET /api/organizations/:id/settings and PATCH the same route.
 */
export default function OrgSettings() {
  const { activeOrganizationId, isManager, role } = useOrganization();
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, error, refetch } = useOrgSettings(activeOrganizationId);

  const settings = data?.settings;
  const organization = data?.organization;

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (settings) {
      setForm({
        pickupLocation: settings.pickupLocation || '',
        instructions: settings.instructions || '',
        matchThreshold: Number(settings.matchThreshold ?? 0),
        highConfidence: Number(settings.highConfidence ?? 0),
        requireVerification: Boolean(settings.requireVerification),
        allowCctvRequests: Boolean(settings.allowCctvRequests),
        matchAlerts: Boolean(settings.matchAlerts),
        verificationAlerts: Boolean(settings.verificationAlerts),
        returnAlerts: Boolean(settings.returnAlerts)
      });
    }
  }, [settings]);

  /* ---------------- organization identity (its own endpoint) ---------------- */
  // PATCH /api/organizations/:id has always accepted name, type, location and
  // logoUrl; this panel simply had no form. It is kept separate from the settings
  // form because it is a different route with a different permission check.
  const [identity, setIdentity] = useState(null);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState('');

  useEffect(() => {
    if (!organization) return;
    setIdentity({
      name: organization.name || '',
      type: organization.type || 'school',
      location: organization.location || '',
      logoUrl: organization.logoUrl || ''
    });
  }, [organization]);

  const identityDirty = Boolean(identity && organization) && (
    identity.name.trim() !== (organization.name || '')
    || identity.type !== (organization.type || 'school')
    || identity.location.trim() !== (organization.location || '')
    || identity.logoUrl !== (organization.logoUrl || '')
  );

  const setIdentityField = (key, value) => setIdentity((prev) => ({ ...prev, [key]: value }));

  const saveIdentity = async (e) => {
    e.preventDefault();
    if (!identity) return;
    if (identity.name.trim().length < 2) {
      setIdentityError('The organization name must be at least 2 characters.');
      return;
    }
    setIdentityError('');
    setSavingIdentity(true);
    try {
      const res = await api.updateOrg(activeOrganizationId, {
        name: identity.name.trim(),
        type: identity.type,
        location: identity.location.trim(),
        logoUrl: identity.logoUrl
      });
      toast.success(res?.message || 'Organization profile saved');
      qc.invalidateQueries({ queryKey: ['org-settings', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      // The topbar, the sidebar and the portal switcher all render the active
      // organization from the session, so the rename has to reach it too.
      await refresh();
    } catch (err) {
      setIdentityError(err?.message || 'Could not save the organization profile');
    } finally {
      setSavingIdentity(false);
    }
  };

  const dirty = Boolean(form && settings) && (
    form.pickupLocation !== (settings.pickupLocation || '')
    || form.instructions !== (settings.instructions || '')
    || form.matchThreshold !== Number(settings.matchThreshold ?? 0)
    || form.highConfidence !== Number(settings.highConfidence ?? 0)
    || TOGGLES.some(({ key }) => form[key] !== Boolean(settings[key]))
  );

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form) return;
    if (form.matchThreshold > form.highConfidence) {
      setFormError('The minimum match threshold cannot be higher than the high-confidence score.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const res = await api.updateOrgSettings(activeOrganizationId, {
        pickupLocation: form.pickupLocation.trim(),
        instructions: form.instructions.trim(),
        matchThreshold: Number(form.matchThreshold),
        highConfidence: Number(form.highConfidence),
        requireVerification: form.requireVerification,
        allowCctvRequests: form.allowCctvRequests,
        matchAlerts: form.matchAlerts,
        verificationAlerts: form.verificationAlerts,
        returnAlerts: form.returnAlerts
      });
      toast.success(res?.message || 'Settings saved');
      qc.invalidateQueries({ queryKey: ['org-settings', activeOrganizationId] });
    } catch (err) {
      setFormError(err?.message || 'Could not save the settings');
    } finally {
      setSaving(false);
    }
  };

  const copyInviteCode = async () => {
    if (!organization?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(organization.inviteCode);
      toast.success('Invite code copied');
    } catch {
      toast.error('Could not copy the invite code — select it manually');
    }
  };

  return (
    <div>
      <PageHeader
        title="Organization settings"
        subtitle="Pickup desk, handover instructions, matching thresholds and the alerts staff rely on."
        actions={isManager ? (
          <Button onClick={save} loading={saving} disabled={!dirty}>
            <Save className="h-4 w-4" /> {dirty ? 'Save changes' : 'Saved'}
          </Button>
        ) : null}
      />

      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading || !form ? (
        <div className="space-y-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        !isError && (
          <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
            <form onSubmit={save} className="space-y-6">
              <section className="card-surface p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <MapPin className="h-4 w-4 text-brand-600" /> Handover
                </h2>
                <p className="mb-5 mt-1 text-sm text-slate-500">
                  Where and how verified owners collect their items. This text is shown on every return authorisation.
                </p>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="pickupLocation" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Default pickup location
                    </label>
                    <input
                      id="pickupLocation"
                      value={form.pickupLocation}
                      disabled={!isManager}
                      onChange={(e) => setField('pickupLocation', e.target.value)}
                      maxLength={200}
                      placeholder="Security Desk"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="instructions" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Pickup instructions
                    </label>
                    <textarea
                      id="instructions"
                      value={form.instructions}
                      disabled={!isManager}
                      onChange={(e) => setField('instructions', e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="Present your one-time QR code and confirm your identity."
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>
                </div>
              </section>

              <section className="card-surface p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Sliders className="h-4 w-4 text-brand-600" /> Matching thresholds
                </h2>
                <p className="mb-5 mt-1 text-sm text-slate-500">
                  The minimum score for a candidate to be created, and the score at which it is treated as high confidence.
                </p>

                <div className="grid gap-5 sm:grid-cols-2">
                  <ThresholdField
                    id="matchThreshold"
                    label="Minimum match score"
                    hint="Below this, LostLink AI does not create a candidate at all."
                    value={form.matchThreshold}
                    disabled={!isManager}
                    onChange={(v) => setField('matchThreshold', v)}
                  />
                  <ThresholdField
                    id="highConfidence"
                    label="High-confidence score"
                    hint="At or above this, a candidate is flagged as high confidence."
                    value={form.highConfidence}
                    disabled={!isManager}
                    onChange={(v) => setField('highConfidence', v)}
                  />
                </div>
              </section>

              <section className="card-surface p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <ToggleRight className="h-4 w-4 text-amber-600" /> Policy &amp; alerts
                </h2>
                <p className="mb-5 mt-1 text-sm text-slate-500">
                  Rules applied across the whole organization.
                </p>

                <ul className="space-y-2">
                  {TOGGLES.map((toggle) => {
                    const on = form[toggle.key];
                    return (
                      <li key={toggle.key}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          disabled={!isManager}
                          onClick={() => setField(toggle.key, !on)}
                          className={cn(
                            'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition',
                            on ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-white hover:border-slate-300',
                            !isManager && 'cursor-not-allowed opacity-60'
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-slate-800">{toggle.label}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{toggle.hint}</span>
                          </span>
                          <span className={cn(
                            'flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition',
                            on ? 'bg-brand-600' : 'bg-slate-300'
                          )}
                          >
                            <motion.span
                              layout
                              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                              className={cn('h-5 w-5 rounded-full bg-white shadow', on ? 'ml-auto' : 'mr-auto')}
                            />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {formError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {isManager ? (
                  <>
                    <Button type="submit" loading={saving} disabled={!dirty}>
                      <Save className="h-4 w-4" /> Save settings
                    </Button>
                    {dirty && <p className="text-xs text-amber-600">You have unsaved changes.</p>}
                  </>
                ) : (
                  <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600">
                    <Info className="h-4 w-4" />
                    You are signed in as {role}. Only owners and admins can change these settings.
                  </p>
                )}
              </div>
            </form>

            <div className="space-y-6">
              <section className="card-surface p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Building2 className="h-4 w-4 text-brand-600" /> Organization profile
                </h2>
                <p className="mb-5 mt-1 text-sm text-slate-500">
                  {isManager
                    ? 'The name and mark every member sees when they sign in.'
                    : 'Owners and admins can change these details.'}
                </p>

                {isManager && identity ? (
                  <form onSubmit={saveIdentity} className="mb-6 space-y-4">
                    {/* The mark is stored on the tenant as a 256px data URL, so
                        this is the same picker the create wizard uses. */}
                    <LogoPicker
                      value={identity.logoUrl}
                      onChange={(value) => setIdentityField('logoUrl', value)}
                      name={identity.name}
                    />

                    <div>
                      <label htmlFor="org-name" className={labelClass}>Organization name</label>
                      <input
                        id="org-name"
                        value={identity.name}
                        onChange={(e) => setIdentityField('name', e.target.value)}
                        maxLength={120}
                        className={fieldClass}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="org-type" className={labelClass}>Type</label>
                        <select
                          id="org-type"
                          value={identity.type}
                          onChange={(e) => setIdentityField('type', e.target.value)}
                          className={fieldClass}
                        >
                          {TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="org-location" className={labelClass}>Location</label>
                        <input
                          id="org-location"
                          value={identity.location}
                          onChange={(e) => setIdentityField('location', e.target.value)}
                          maxLength={200}
                          placeholder="Pune, Maharashtra"
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    {identityError && (
                      <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[12px] font-semibold text-red-700">
                        {identityError}
                      </p>
                    )}

                    <div className="flex items-center gap-3">
                      <Button type="submit" size="sm" loading={savingIdentity} disabled={!identityDirty}>
                        <Save className="h-4 w-4" /> Save profile
                      </Button>
                      {identityDirty && !savingIdentity && (
                        <p className="text-xs text-amber-600">Unsaved changes</p>
                      )}
                    </div>
                  </form>
                ) : null}

                <dl className="space-y-3 border-t border-slate-100 pt-5">
                  {!isManager && (
                    <>
                      <IdentityRow label="Name" value={organization?.name} />
                      <IdentityRow label="Type" value={organization?.type ? organization.type[0].toUpperCase() + organization.type.slice(1) : null} />
                      <IdentityRow label="Location" value={organization?.location || null} />
                    </>
                  )}
                  <IdentityRow
                    label="Email domain"
                    value={organization?.emailDomains?.length ? organization.emailDomains.join(', ') : organization?.verifiedDomains?.length ? organization.verifiedDomains.join(', ') : null}
                  />
                  <IdentityRow label="Created" value={formatDate(organization?.createdAt)} />
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verification status</dt>
                    <dd className="mt-1">
                      <StatusBadge
                        status={organization?.verificationStatus}
                        label={organization?.verificationStatus
                          ? organization.verificationStatus[0].toUpperCase() + organization.verificationStatus.slice(1)
                          : 'Unknown'}
                        tone={VERIFICATION_TONES[organization?.verificationStatus] || 'default'}
                      />
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="card-surface p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-brand-600" /> Join code
                </h2>
                <p className="mb-4 mt-1 text-sm text-slate-500">
                  Anyone with this code can register into {organization?.name || 'this organization'} as a member.
                </p>
                <button
                  onClick={copyInviteCode}
                  disabled={!organization?.inviteCode}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-4 py-3.5 text-left transition hover:bg-brand-50 disabled:opacity-60"
                >
                  <span className="font-mono text-xl font-extrabold tracking-widest text-brand-700">
                    {organization?.inviteCode || 'Unavailable'}
                  </span>
                  <Copy className="h-4 w-4 shrink-0 text-brand-600" />
                </button>
              </section>

              <section className="card-surface p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Video className="h-4 w-4 text-amber-600" /> Camera requests
                </h2>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-xs leading-relaxed text-rose-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Camera requests are{' '}
                    <strong>{form.allowCctvRequests ? 'enabled' : 'disabled'}</strong> for this organization, but this
                    build has no camera provider connected — no feed, no snapshot and no footage retention. The
                    switch records policy only; requests still have to be handled manually through the last-seen
                    record on the report.
                  </span>
                </div>
              </section>

              <section className="card-surface p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <BellRing className="h-4 w-4 text-brand-600" /> Notification policy
                </h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {TOGGLES.filter((t) => t.key.endsWith('Alerts')).map((toggle) => (
                    <li key={toggle.key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3.5 py-2.5">
                      <span className="text-slate-600">{toggle.label.replace(' alerts', '')}</span>
                      <span className={cn(
                        'text-xs font-bold',
                        form[toggle.key] ? 'text-emerald-600' : 'text-slate-400'
                      )}
                      >
                        {form[toggle.key] ? 'On' : 'Off'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function IdentityRow({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-800">{value || '—'}</dd>
    </div>
  );
}

function ThresholdField({ id, label, hint, value, disabled, onChange }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
      <div className="mt-2 flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#0d9488] disabled:cursor-not-allowed"
        />
        <span className="w-12 shrink-0 rounded-lg bg-white px-2 py-1 text-center text-sm font-extrabold tabular-nums text-slate-800 ring-1 ring-slate-200">
          {value}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
}
