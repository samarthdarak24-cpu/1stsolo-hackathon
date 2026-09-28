/**
 * Profile — the signed-in user's real, persisted identity.
 *
 * Every control here writes to the API: PATCH /api/profile for the identity form
 * and the notification preferences, POST /api/profile/password for credentials,
 * PATCH /api/auth/switch-org for the active organization. Nothing is faked —
 * a successful save also invalidates ['profile'] and refreshes the auth session
 * so the topbar reflects the new name immediately.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  User, Building2, ShieldCheck, KeyRound, Monitor, LogOut, Save, Copy,
  Check, AlertCircle, Mail, Phone, Camera
} from 'lucide-react';
import api from '../lib/api';
import { useProfile, useOrganizations } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import ErrorState from '../components/ErrorState';
import StatusBadge from '../components/StatusBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SkeletonCard, Skeleton } from '../components/ui/Skeleton';
import ImageDrop from '../components/ui/ImageDrop';
import { cn } from '../lib/cn';
import { formatDate, formatDateTime, initialsOf } from '../lib/format';

const MAX_BIO = 500;
const MIN_PASSWORD = 8;
// Matches the server's upload limit, same as the report wizard.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const DEFAULT_PREFERENCES = {
  matchAlerts: true,
  verificationAlerts: true,
  returnAlerts: true,
  emailAlerts: true,
  shareLocation: true,
  cctvConsent: false
};

const ROLE_TONE = {
  owner: 'success',
  admin: 'primary',
  staff: 'info',
  security: 'warning',
  member: 'default'
};

const PREFERENCE_ROWS = [
  { key: 'matchAlerts', label: 'AI match alerts', description: 'When the AI finds a potential match for one of your reports.' },
  { key: 'verificationAlerts', label: 'Verification alerts', description: 'Questions to answer and the result of each ownership check.' },
  { key: 'returnAlerts', label: 'Return alerts', description: 'Pickup codes, custody updates and hand-off reminders.' },
  { key: 'emailAlerts', label: 'Email alerts', description: 'A copy of important activity in your inbox as well as in-app.' }
];

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-500';
const labelClass = 'mb-1.5 block text-[12px] font-bold text-slate-700';

/** Accessible on/off row used by the preference list. */
function ToggleRow({ id, label, description, checked, onChange, pending, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-bold text-slate-800">{label}</label>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40',
          checked ? 'bg-brand-600' : 'bg-slate-200',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5'
          )}
        />
        {pending && (
          <span className="absolute -top-6 right-0 text-[10px] font-bold text-slate-400">Saving</span>
        )}
      </button>
    </div>
  );
}

function Avatar({ user, className }) {
  const [broken, setBroken] = useState(false);
  const src = user?.avatarUrl;

  useEffect(() => { setBroken(false); }, [src]);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={`${user?.name || 'User'} avatar`}
        onError={() => setBroken(true)}
        className={cn('h-20 w-20 rounded-2xl object-cover ring-4 ring-brand-50', className)}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-extrabold text-white ring-4 ring-brand-50',
        className
      )}
    >
      {initialsOf(user?.name || '?')}
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user: sessionUser, refresh, logout } = useAuth();
  const { activeOrganizationId, switchOrganization } = useOrganization();

  const { data: profile, isLoading, isError, error, refetch } = useProfile();
  const { data: orgList } = useOrganizations();

  const profileUser = profile?.user || null;
  const verified = Boolean(profileUser?.isVerified ?? sessionUser?.isVerified);

  /* ---------------- identity form ---------------- */
  const [form, setForm] = useState({ name: '', phone: '', bio: '', avatarUrl: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [switchingOrg, setSwitchingOrg] = useState(null);

  useEffect(() => {
    if (!profileUser) return;
    setForm({
      name: profileUser.name || '',
      phone: profileUser.phone || '',
      bio: profileUser.bio || '',
      avatarUrl: profileUser.avatarUrl || ''
    });
  }, [profileUser]);

  /* ---------------- password form ---------------- */
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  /* ---------------- preferences ---------------- */
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [pendingPreference, setPendingPreference] = useState(null);

  useEffect(() => {
    if (!profileUser?.preferences) return;
    setPreferences({ ...DEFAULT_PREFERENCES, ...profileUser.preferences });
  }, [profileUser?.preferences]);

  /**
   * Deep link from the avatar menu: "Organizations" is a section of this page,
   * so arriving there should scroll to it rather than dumping the user at the
   * top of their profile. Re-runs when the data lands, because the section is
   * not in the DOM until the memberships render.
   */
  useEffect(() => {
    if (searchParams.get('section') !== 'organizations') return;
    document.getElementById('organizations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchParams, profile]);

  /* ---------------- verification ---------------- */
  const [verifying, setVerifying] = useState(false);

  /**
   * The avatar is stored the moment it is picked, so this is the only place the
   * photo is sent. `profile` is invalidated and the session refreshed because the
   * topbar and every card render the same URL.
   */
  const onPickAvatar = async (files) => {
    const file = files?.[0];
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    try {
      const res = await api.uploadAvatar(file);
      setForm((f) => ({ ...f, avatarUrl: res.avatarUrl }));
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refresh();
      toast.success(res.message || 'Avatar updated');
    } catch (err) {
      setFormError(err?.message || 'That photo could not be uploaded.');
      toast.error(err?.message || 'Could not upload that photo');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (name.length < 2) {
      setFormError('Your name must be at least 2 characters.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await api.updateProfile({
        name,
        phone: form.phone.trim(),
        bio: form.bio.slice(0, MAX_BIO),
        avatarUrl: form.avatarUrl.trim()
      });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refresh();
      toast.success('Profile saved');
    } catch (err) {
      setFormError(err?.message || 'We could not save your profile. Please try again.');
      toast.error(err?.message || 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwords.newPassword.length < MIN_PASSWORD) {
      setPasswordError(`Choose a password with at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError('The new password and its confirmation do not match.');
      return;
    }
    if (passwords.newPassword === passwords.currentPassword) {
      setPasswordError('Choose a new password that is different from your current one.');
      return;
    }
    setChangingPassword(true);
    setPasswordError('');
    try {
      await api.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password updated');
    } catch (err) {
      setPasswordError(err?.message || 'We could not change your password.');
      toast.error(err?.message || 'Could not change your password');
    } finally {
      setChangingPassword(false);
    }
  };

  const togglePreference = async (key, value) => {
    const previous = preferences;
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setPendingPreference(key);
    try {
      await api.updateProfile({ preferences: { [key]: value } });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refresh();
      toast.success(`${PREFERENCE_ROWS.find((row) => row.key === key)?.label || 'Preference'} ${value ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setPreferences(previous);
      toast.error(err?.message || 'Could not save that preference');
    } finally {
      setPendingPreference(null);
    }
  };

  const handleSwitchOrg = async (org) => {
    setSwitchingOrg(org.id);
    try {
      await switchOrganization(org.id);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success(`Switched to ${org.name}`);
    } catch (err) {
      toast.error(err?.message || 'Could not switch organization');
    } finally {
      setSwitchingOrg(null);
    }
  };

  const handleVerifyEmail = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyEmail(profileUser?.email || sessionUser?.email);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success(res?.message || 'Email verified');
    } catch (err) {
      toast.error(err?.message || 'Could not verify your email');
    } finally {
      setVerifying(false);
    }
  };

  const copyInviteCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Invite code ${code} copied`);
    } catch {
      toast.error('Copy failed — select the code and copy it manually');
    }
  };

  if (isError) {
    return (
      <div>
        <PageHeader title="Profile" subtitle="Manage your identity, security and organizations." />
        <ErrorState error={error} title="We couldn't load your profile" onRetry={refetch} />
      </div>
    );
  }

  const memberships = profile?.organizations || [];
  const sessions = Array.isArray(profile?.sessions) ? profile.sessions : [];
  const security = profile?.security || {};
  const orgDetails = orgList?.organizations || orgList || [];

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Manage your identity, security and organizations."
        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate('/settings')}>
              Settings
            </Button>
            <Button variant="danger" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ---------------- main column ---------------- */}
        <div className="stagger space-y-6 xl:col-span-2">
          <Card>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-slate-900">Profile information</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">This is how you appear to your organization.</p>

            {isLoading ? (
              <div className="mt-5 space-y-4">
                <Skeleton className="h-20 w-20 rounded-2xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : (
              <form className="mt-5 space-y-5" onSubmit={handleSaveProfile} noValidate>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <Avatar user={{ ...profileUser, avatarUrl: form.avatarUrl }} className="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className={labelClass}>
                      <span className="inline-flex items-center gap-1.5">
                        <Camera className="h-3.5 w-3.5" /> Your photo
                      </span>
                    </p>
                    {/*
                      * Uploads immediately instead of travelling with the form:
                      * the photo is a file, and the API takes the stored URL. The
                      * URL it returns is kept in `form.avatarUrl`, so "Remove" and
                      * Save still behave like the rest of the form.
                      */}
                    <ImageDrop
                      value={form.avatarUrl ? [{ url: form.avatarUrl, name: 'Your avatar' }] : []}
                      max={1}
                      maxBytes={MAX_AVATAR_BYTES}
                      busy={avatarBusy}
                      showCoverBadge={false}
                      label="Upload a photo"
                      hint={`Drag a photo here or browse. JPG, PNG or WebP, up to ${Math.round(MAX_AVATAR_BYTES / (1024 * 1024))} MB.`}
                      onAdd={onPickAvatar}
                      onRemove={() => setForm((f) => ({ ...f, avatarUrl: '' }))}
                      className="max-w-[260px]"
                    />
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {form.avatarUrl
                        ? 'Saved. Press Remove to go back to your initials.'
                        : 'Optional — we show your initials if you skip this.'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="profile-name" className={labelClass}>Full name</label>
                    <input
                      id="profile-name"
                      type="text"
                      required
                      maxLength={80}
                      autoComplete="name"
                      className={inputClass}
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-email" className={labelClass}>Email</label>
                    <div className="relative">
                      <input
                        id="profile-email"
                        type="email"
                        readOnly
                        disabled
                        aria-describedby="profile-email-hint"
                        className={cn(inputClass, 'pr-28')}
                        value={profileUser?.email || sessionUser?.email || ''}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                        <StatusBadge
                          tone={verified ? 'success' : 'warning'}
                          label={verified ? 'Verified' : 'Unverified'}
                        />
                      </span>
                    </div>
                    <p id="profile-email-hint" className="mt-1.5 text-[11px] text-slate-400">
                      Your sign-in email cannot be changed here.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="profile-phone" className={labelClass}>
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> Phone
                      </span>
                    </label>
                    <input
                      id="profile-phone"
                      type="tel"
                      maxLength={32}
                      autoComplete="tel"
                      placeholder="+91 98765 43210"
                      className={inputClass}
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                    <p className="mt-1.5 text-[11px] text-slate-400">Used by security staff to reach you about a return.</p>
                  </div>
                  <div>
                    <label htmlFor="profile-member-since" className={labelClass}>Member since</label>
                    <input
                      id="profile-member-since"
                      type="text"
                      readOnly
                      disabled
                      className={inputClass}
                      value={formatDate(profileUser?.createdAt || sessionUser?.createdAt)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="profile-bio" className={labelClass}>Bio</label>
                  <textarea
                    id="profile-bio"
                    rows={4}
                    maxLength={MAX_BIO}
                    placeholder="Anything your campus security team should know about you."
                    className={cn(inputClass, 'resize-y')}
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  />
                  <p className="mt-1.5 text-right text-[11px] text-slate-400">
                    {form.bio.length}/{MAX_BIO}
                  </p>
                </div>

                {formError && (
                  <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <Button type="submit" loading={saving}>
                    <Save className="h-4 w-4" /> Save changes
                  </Button>
                  {saving && <span className="text-xs text-slate-400">Saving to your profile…</span>}
                </div>
              </form>
            )}
          </Card>

          <Card id="organizations" className="scroll-mt-24">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-bold text-slate-900">Organizations</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-extrabold text-slate-600">
                {memberships.length} membership{memberships.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              The active organization decides whose reports, matches and returns you see.
            </p>

            {isLoading ? (
              <div className="mt-4 space-y-3">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : memberships.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center">
                <p className="text-sm font-semibold text-slate-700">You are not a member of any organization yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                  Join one with an invite code to start reporting items.
                </p>
                <Button size="sm" className="mt-4" onClick={() => navigate('/settings')}>
                  Join an organization
                </Button>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {memberships.map((org) => {
                  const isActive = org.active || org.id === activeOrganizationId;
                  const manager = ['owner', 'admin'].includes(org.role);
                  const details = orgDetails.find((o) => o.id === org.id);
                  const inviteCode = manager ? details?.inviteCode : null;
                  return (
                    <li
                      key={org.id}
                      className={cn(
                        'rounded-2xl border p-4 transition',
                        isActive ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200 bg-white'
                      )}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-bold text-slate-900">{org.name}</h3>
                            {isActive && <StatusBadge tone="primary" label="Active" />}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            <span className="capitalize">{org.type || 'organization'}</span>
                            {org.location ? ` · ${org.location}` : ''} · joined {formatDate(org.joinedAt)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge
                              tone={ROLE_TONE[org.role] || 'default'}
                              label={org.role ? `${org.role.charAt(0).toUpperCase()}${org.role.slice(1)}` : 'Member'}
                            />
                            {(org.permissions?.length || 0) > 0 && (
                              <span className="text-[11px] text-slate-400">
                                {org.permissions.length} permission{org.permissions.length === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={isActive ? 'secondary' : 'primary'}
                          disabled={isActive || switchingOrg === org.id}
                          loading={switchingOrg === org.id}
                          onClick={() => handleSwitchOrg(org)}
                        >
                          {isActive ? 'Current organization' : 'Switch to this organization'}
                        </Button>
                      </div>

                      <div className="mt-3 border-t border-slate-100 pt-3">
                        {manager ? (
                          inviteCode ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Invite code</span>
                              <code className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-800">{inviteCode}</code>
                              <Button size="sm" variant="ghost" onClick={() => copyInviteCode(inviteCode)}>
                                <Copy className="h-3.5 w-3.5" /> Copy
                              </Button>
                              <Link to="/organization/people?tab=settings" className="text-[11px] font-bold text-brand-600 hover:underline">
                                Manage invites
                              </Link>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400">
                              Invite codes are only returned to managers by the organization service.
                            </p>
                          )
                        ) : (
                          <p className="text-[11px] text-slate-400">
                            Ask an owner or admin for the invite code if you need to add colleagues.
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ---------------- side column ---------------- */}
        <div className="stagger space-y-6">
          <Card>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-slate-900">Security</h2>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs font-bold text-slate-700">Email verification</p>
                  <p className="text-[11px] text-slate-500">{profileUser?.email || sessionUser?.email || '—'}</p>
                </div>
              </div>
              <StatusBadge tone={verified ? 'success' : 'warning'} label={verified ? 'Verified' : 'Pending'} />
            </div>

            {!verified && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3">
                <p className="text-xs font-semibold text-amber-800">
                  Your email is not verified. Verified members can receive and clear ownership checks.
                </p>
                <Button size="sm" variant="outline" className="mt-2.5" loading={verifying} onClick={handleVerifyEmail}>
                  Verify my email
                </Button>
              </div>
            )}

            {security.passwordSet === false && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                This account has no password set — use “Forgot password” on the login screen to secure it.
              </p>
            )}

            <form className="mt-5 space-y-4 border-t border-slate-100 pt-5" onSubmit={handleChangePassword} noValidate>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-slate-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Change password</h3>
              </div>

              <div>
                <label htmlFor="current-password" className={labelClass}>Current password</label>
                <input
                  id="current-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                  value={passwords.currentPassword}
                  onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="new-password" className={labelClass}>New password</label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD}
                  autoComplete="new-password"
                  aria-describedby="new-password-hint"
                  className={inputClass}
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                />
                <p id="new-password-hint" className="mt-1.5 text-[11px] text-slate-400">
                  At least {MIN_PASSWORD} characters.
                </p>
              </div>
              <div>
                <label htmlFor="confirm-password" className={labelClass}>Confirm new password</label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  className={inputClass}
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
                />
              </div>

              {passwordError && (
                <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {passwordError}
                </p>
              )}

              <Button type="submit" loading={changingPassword}>Update password</Button>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-slate-900">Active sessions</h2>
            </div>
            {sessions.length === 0 ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
                This build does not track device sessions, so there is nothing to list. Changing your password
                is the only way to end other sessions.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {sessions.map((session) => (
                  <li key={session.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{session.device || 'Unknown device'}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Last used {formatDateTime(session.lastUsedAt)}</p>
                    </div>
                    {session.current ? (
                      <StatusBadge tone="success" label="This device" />
                    ) : (
                      <StatusBadge tone="default" label="Active" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-bold text-slate-900">Notification preferences</h2>
              </div>
              <Link to="/settings" className="text-[11px] font-bold text-brand-600 hover:underline">All settings</Link>
            </div>
            <p className="mt-1 text-xs text-slate-500">Saved the moment you change them.</p>

            <div className="mt-2 divide-y divide-slate-100">
              {PREFERENCE_ROWS.map((row) => (
                <ToggleRow
                  key={row.key}
                  id={`pref-${row.key}`}
                  label={row.label}
                  description={row.description}
                  checked={Boolean(preferences[row.key])}
                  pending={pendingPreference === row.key}
                  disabled={pendingPreference === row.key}
                  onChange={(value) => togglePreference(row.key, value)}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
