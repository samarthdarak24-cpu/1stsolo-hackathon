/**
 * Settings — tabbed preferences for the signed-in user.
 *
 * Tabs: Account, Notifications, Privacy, Security, Memberships.
 * Every section persists through the real API (PATCH /api/profile,
 * POST /api/profile/password, POST /api/organizations/join). Preference toggles
 * are optimistic: the switch flips immediately, the PATCH follows, and the value
 * rolls back with an error toast if the write fails. Two-factor authentication is
 * reported as unavailable in this build rather than faked with a dead screen.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  User, Bell, Eye, ShieldCheck, Building2, Save, AlertCircle, LogOut,
  Ticket, Check, Mail, Phone, Lock, Info
} from 'lucide-react';
import api, { resolveUrl } from '../lib/api';
import { useProfile } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import ErrorState from '../components/ErrorState';
import StatusBadge from '../components/StatusBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../lib/cn';
import { formatDate, initialsOf } from '../lib/format';

const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy', icon: Eye },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'memberships', label: 'Memberships', icon: Building2 }
];

const DEFAULT_PREFERENCES = {
  matchAlerts: true,
  verificationAlerts: true,
  returnAlerts: true,
  emailAlerts: true,
  shareLocation: true,
  cctvConsent: false
};

const MIN_PASSWORD = 8;

const ALERT_ROWS = [
  { key: 'matchAlerts', label: 'AI match alerts', description: 'Tell me the moment the AI pairs one of my reports with a found item.' },
  { key: 'verificationAlerts', label: 'Verification alerts', description: 'Ownership questions I need to answer, and the outcome of each check.' },
  { key: 'returnAlerts', label: 'Return alerts', description: 'Pickup codes, custody hand-offs and return confirmations.' },
  { key: 'emailAlerts', label: 'Email alerts', description: 'Also send important activity to my inbox, not just in-app.' }
];

const PRIVACY_ROWS = [
  {
    key: 'shareLocation',
    label: 'Share location with my organization',
    description: 'Lets your organization see the area of a report you file so staff can help search nearby. Turning this off keeps reports in the queue without a location hint.'
  },
  {
    key: 'cctvConsent',
    label: 'Allow CCTV evidence requests',
    description: 'CCTV frames are only ever requested when your organization allows CCTV requests in its own settings. This consent lets staff ask for footage that may identify your item — it does not grant access to any camera.'
  }
];

const ROLE_TONE = {
  owner: 'success',
  admin: 'primary',
  staff: 'info',
  security: 'warning',
  member: 'default'
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-500';
const labelClass = 'mb-1.5 block text-[12px] font-bold text-slate-700';

function ToggleRow({ id, label, description, checked, onChange, pending }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-bold text-slate-800">{label}</label>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={pending}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40',
          checked ? 'bg-brand-600' : 'bg-slate-200',
          pending && 'cursor-not-allowed opacity-60'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5'
          )}
        />
      </button>
    </div>
  );
}

function ProfileAvatar({ user, size = 'h-16 w-16' }) {
  const [broken, setBroken] = useState(false);
  const src = user?.avatarUrl;

  useEffect(() => { setBroken(false); }, [src]);

  if (src && !broken) {
    return (
      <img
        src={resolveUrl(src)}
        alt={`${user?.name || 'User'} avatar`}
        onError={() => setBroken(true)}
        className={cn(size, 'rounded-2xl object-cover ring-4 ring-brand-50')}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        size,
        'flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-extrabold text-white ring-4 ring-brand-50'
      )}
    >
      {initialsOf(user?.name || '?')}
    </div>
  );
}

function SectionCard({ icon: Icon, title, description, children, footer }) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-brand-600" />}
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      </div>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      <div className="mt-5">{children}</div>
      {footer && <div className="mt-5 border-t border-slate-100 pt-4">{footer}</div>}
    </Card>
  );
}

export default function Settings() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user: sessionUser, refresh, logout } = useAuth();
  const { activeOrganizationId } = useOrganization();

  const { data: profile, isLoading, isError, error, refetch } = useProfile();
  const profileUser = profile?.user || null;
  const verified = Boolean(profileUser?.isVerified ?? sessionUser?.isVerified);

  const [tab, setTab] = useState('account');

  /* ---------------- account ---------------- */
  const [account, setAccount] = useState({ name: '', phone: '' });
  const [accountError, setAccountError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  /* ---------------- preferences ---------------- */
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [pendingPreference, setPendingPreference] = useState(null);

  /* ---------------- security ---------------- */
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  /* ---------------- memberships ---------------- */
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!profileUser) return;
    setAccount({ name: profileUser.name || '', phone: profileUser.phone || '' });
  }, [profileUser]);

  useEffect(() => {
    if (!profileUser?.preferences) return;
    setPreferences({ ...DEFAULT_PREFERENCES, ...profileUser.preferences });
  }, [profileUser?.preferences]);

  const togglePreference = async (key, value) => {
    const previous = preferences;
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setPendingPreference(key);
    try {
      await api.updateProfile({ preferences: { [key]: value } });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refresh();
      toast.success('Preference saved');
    } catch (err) {
      setPreferences(previous);
      toast.error(err?.message || 'Could not save that preference');
    } finally {
      setPendingPreference(null);
    }
  };

  const handleAccountSave = async (e) => {
    e.preventDefault();
    const name = account.name.trim();
    if (name.length < 2) {
      setAccountError('Your name must be at least 2 characters.');
      return;
    }
    setSavingAccount(true);
    setAccountError('');
    try {
      await api.updateProfile({ name, phone: account.phone.trim() });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refresh();
      toast.success('Account details saved');
    } catch (err) {
      setAccountError(err?.message || 'We could not save your details.');
      toast.error(err?.message || 'Could not save your details');
    } finally {
      setSavingAccount(false);
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

  const handleJoinOrg = async (e) => {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError('Invite codes are at least 4 characters.');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const res = await api.joinOrg(code);
      setInviteCode('');
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success(res?.message || (res?.joined ? 'You joined the organization' : 'Membership confirmed'));
    } catch (err) {
      setJoinError(err?.message || 'That invite code could not be used.');
    } finally {
      setJoining(false);
    }
  };

  if (isError) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Control your account, alerts, privacy and memberships." />
        <ErrorState error={error} title="We couldn't load your settings" onRetry={refetch} />
      </div>
    );
  }

  const memberships = profile?.organizations || [];
  const security = profile?.security || {};

  return (
    <div className="stagger">
      <PageHeader
        title="Settings"
        subtitle="Control your account, alerts, privacy and memberships."
        actions={(
          <Button variant="danger" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        )}
      />

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              id={`tab-${id}`}
              aria-selected={active}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition',
                active
                  ? 'border-brand-200 bg-brand-50 text-brand-700 shadow-soft'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* ---------------- Account ---------------- */}
      {tab === 'account' && (
        <div role="tabpanel" id="panel-account" aria-labelledby="tab-account" className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            icon={User}
            title="Your account"
            description="How you appear across LostLink AI."
          >
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-16 rounded-2xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleAccountSave} noValidate>
                <div className="flex items-center gap-4">
                  <ProfileAvatar user={profileUser} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{profileUser?.name || '—'}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <Mail className="h-3.5 w-3.5" />
                      {profileUser?.email || sessionUser?.email || '—'}
                    </p>
                    <div className="mt-1.5">
                      <StatusBadge
                        tone={verified ? 'success' : 'warning'}
                        label={verified ? 'Email verified' : 'Email unverified'}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-5 border-t border-slate-100 pt-5">
                  <div>
                    <label htmlFor="settings-name" className={labelClass}>Display name</label>
                    <input
                      id="settings-name"
                      type="text"
                      required
                      maxLength={80}
                      autoComplete="name"
                      className={inputClass}
                      value={account.name}
                      onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-phone" className={labelClass}>
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> Phone
                      </span>
                    </label>
                    <input
                      id="settings-phone"
                      type="tel"
                      maxLength={32}
                      autoComplete="tel"
                      placeholder="+91 98765 43210"
                      className={inputClass}
                      value={account.phone}
                      onChange={(e) => setAccount((a) => ({ ...a, phone: e.target.value }))}
                    />
                  </div>
                </div>

                {accountError && (
                  <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {accountError}
                  </p>
                )}

                <Button type="submit" loading={savingAccount}>
                  <Save className="h-4 w-4" /> Save account details
                </Button>
              </form>
            )}
          </SectionCard>

          <SectionCard
            icon={Info}
            title="About your membership"
            description="Read-only facts from your profile."
          >
            <dl className="space-y-3 text-sm">
              {[
                ['Organizations', `${memberships.length} membership${memberships.length === 1 ? '' : 's'}`],
                ['Active organization', memberships.find((o) => o.active || o.id === activeOrganizationId)?.name || '—'],
                ['Email', profileUser?.email || sessionUser?.email || '—'],
                ['Member since', formatDate(profileUser?.createdAt)],
                ['Account ID', profileUser?.id || sessionUser?.id || '—']
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                  <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                  <dd className="truncate text-right text-xs font-bold text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 rounded-xl bg-slate-50 px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
              Your avatar and bio live on the{' '}
              <Link to="/profile" className="font-bold text-brand-600 hover:underline">Profile page</Link>.
            </p>
          </SectionCard>
        </div>
      )}

      {/* ---------------- Notifications ---------------- */}
      {tab === 'notifications' && (
        <div role="tabpanel" id="panel-notifications" aria-labelledby="tab-notifications">
          <SectionCard
            icon={Bell}
            title="Notification preferences"
            description="Each switch saves instantly — LostLink AI stops creating alerts for anything you turn off."
          >
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </div>
            ) : (
              <div>
                {ALERT_ROWS.map((row) => (
                  <ToggleRow
                    key={row.key}
                    id={`settings-${row.key}`}
                    label={row.label}
                    description={row.description}
                    checked={Boolean(preferences[row.key])}
                    pending={pendingPreference === row.key}
                    onChange={(value) => togglePreference(row.key, value)}
                  />
                ))}
              </div>
            )}
            <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
              Turning an alert off stops new notifications of that type. Notifications you already received stay in
              your inbox.
            </p>
          </SectionCard>
        </div>
      )}

      {/* ---------------- Privacy ---------------- */}
      {tab === 'privacy' && (
        <div role="tabpanel" id="panel-privacy" aria-labelledby="tab-privacy">
          <SectionCard
            icon={Eye}
            title="Privacy & consent"
            description="Control what your organization may see or request about you."
          >
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : (
              <div>
                {PRIVACY_ROWS.map((row) => (
                  <ToggleRow
                    key={row.key}
                    id={`settings-${row.key}`}
                    label={row.label}
                    description={row.description}
                    checked={Boolean(preferences[row.key])}
                    pending={pendingPreference === row.key}
                    onChange={(value) => togglePreference(row.key, value)}
                  />
                ))}
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-3 text-[11px] leading-relaxed text-sky-800">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Location sharing and CCTV consent are stored on your user record and honoured by every organization you
              belong to. Turning CCTV consent off does not delete evidence already collected for an open case.
            </p>
          </SectionCard>
        </div>
      )}

      {/* ---------------- Security ---------------- */}
      {tab === 'security' && (
        <div role="tabpanel" id="panel-security" aria-labelledby="tab-security" className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            icon={Lock}
            title="Change password"
            description="At least 8 characters. You stay signed in on this device."
          >
            <form className="space-y-5" onSubmit={handleChangePassword} noValidate>
              <div>
                <label htmlFor="settings-current-password" className={labelClass}>Current password</label>
                <input
                  id="settings-current-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                  value={passwords.currentPassword}
                  onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="settings-new-password" className={labelClass}>New password</label>
                <input
                  id="settings-new-password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD}
                  autoComplete="new-password"
                  aria-describedby="settings-new-password-hint"
                  className={inputClass}
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                />
                <p id="settings-new-password-hint" className="mt-1.5 text-[11px] text-slate-400">
                  Minimum {MIN_PASSWORD} characters.
                </p>
              </div>
              <div>
                <label htmlFor="settings-confirm-password" className={labelClass}>Confirm new password</label>
                <input
                  id="settings-confirm-password"
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
          </SectionCard>

          <SectionCard
            icon={ShieldCheck}
            title="Account protection"
            description="What this build can and cannot do."
          >
            <ul className="space-y-3 text-sm">
              <li className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">Email verification</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {verified
                      ? 'Your email is confirmed, so ownership checks reach you.'
                      : 'Unverified — you may not receive verification questions.'}
                  </p>
                </div>
                <StatusBadge tone={verified ? 'success' : 'warning'} label={verified ? 'Verified' : 'Unverified'} />
              </li>
              <li className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">Password</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {security.passwordSet === false
                      ? 'No password is set on this account.'
                      : 'A password is set on this account.'}
                  </p>
                </div>
                <StatusBadge
                  tone={security.passwordSet === false ? 'warning' : 'success'}
                  label={security.passwordSet === false ? 'Missing' : 'Set'}
                />
              </li>
              <li className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-800">Two-factor authentication</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    Not available in this build. The profile service reports
                    two-factor as {security.twoFactorEnabled ? 'enabled' : 'disabled'} and there is no enrollment
                    endpoint, so there is nothing to configure here yet.
                  </p>
                </div>
                <StatusBadge tone="default" label="Not available" />
              </li>
            </ul>
          </SectionCard>
        </div>
      )}

      {/* ---------------- Memberships ---------------- */}
      {tab === 'memberships' && (
        <div role="tabpanel" id="panel-memberships" aria-labelledby="tab-memberships" className="grid gap-6 lg:grid-cols-3">
          <SectionCard
            icon={Building2}
            title="Your organizations"
            description="Switch the active organization to see its reports, matches and returns."
            footer={memberships.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Use the switcher in the top bar to change organizations at any time.
              </p>
            )}
          >
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : memberships.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3.5 py-4 text-xs text-slate-500">
                You are not a member of any organization yet. Join one with an invite code.
              </p>
            ) : (
              <ul className="space-y-3">
                {memberships.map((org) => {
                  const isActive = org.active || org.id === activeOrganizationId;
                  return (
                    <li
                      key={org.id}
                      className={cn(
                        'rounded-2xl border px-4 py-3',
                        isActive ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{org.name}</p>
                          <p className="mt-0.5 text-[11px] capitalize text-slate-500">
                            {org.type || 'organization'}
                            {org.location ? ` · ${org.location}` : ''}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            joined {formatDate(org.joinedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <StatusBadge
                            tone={ROLE_TONE[org.role] || 'default'}
                            label={org.role ? `${org.role.charAt(0).toUpperCase()}${org.role.slice(1)}` : 'Member'}
                          />
                          {isActive && <StatusBadge tone="primary" label="Active" dot={false} />}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <div className="lg:col-span-2">
            <SectionCard
              icon={Ticket}
              title="Join an organization"
              description="Enter the invite code an owner or admin shared with you."
            >
              <form className="space-y-4" onSubmit={handleJoinOrg} noValidate>
                <div>
                  <label htmlFor="invite-code" className={labelClass}>Invite code</label>
                  <input
                    id="invite-code"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setJoinError(''); }}
                    placeholder="ABCS1234"
                    maxLength={20}
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby={joinError ? 'invite-code-error' : 'invite-code-hint'}
                    aria-invalid={Boolean(joinError)}
                    className={cn(inputClass, 'font-mono uppercase tracking-widest', joinError && 'border-rose-300 focus:border-rose-400 focus:ring-rose-100')}
                  />
                  <p id="invite-code-hint" className="mt-1.5 text-[11px] text-slate-400">
                    Codes are case-insensitive. Demo codes include ABCS1234 and XYZC5678.
                  </p>
                </div>

                {joinError && (
                  <p
                    id="invite-code-error"
                    role="alert"
                    className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" /> {joinError}
                  </p>
                )}

                <Button type="submit" loading={joining}>Join organization</Button>
              </form>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
