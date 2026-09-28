import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Copy, Mail, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOrganization } from '../../context/OrganizationContext';
import { useOrgSettings, useOrgUsers } from '../../lib/queries';
import api from '../../lib/api';
import { useToast, ConfirmDialog, Modal } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/ui/Button';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { formatDate, initialsOf } from '../../lib/format';
import { cn } from '../../lib/cn';

/* The roles the API will accept. "owner" is deliberately absent: ownership is
   transferred elsewhere and PATCH /users/:id rejects it outright. */
const ASSIGNABLE_ROLES = [
  { value: 'member', label: 'Member', blurb: 'Reports items and tracks their own recovery.' },
  { value: 'staff', label: 'Staff', blurb: 'Reviews matches, updates statuses, authorises returns.' },
  { value: 'security', label: 'Security', blurb: 'Handles handovers and scans pickup codes.' },
  { value: 'admin', label: 'Admin', blurb: 'Manages members, settings, analytics and audit logs.' }
];

const roleTone = (role) => ({
  owner: 'border-violet-200 bg-violet-50 text-violet-700',
  admin: 'border-brand-200 bg-brand-50 text-brand-700',
  staff: 'border-sky-200 bg-sky-50 text-sky-700',
  security: 'border-amber-200 bg-amber-50 text-amber-700',
  member: 'border-slate-200 bg-slate-100 text-slate-600'
}[role] || 'border-slate-200 bg-slate-100 text-slate-600');

/**
 * OrgUsers — member roster for the active organization.
 * Endpoints: GET /api/organizations/:id/users, PATCH .../users/:userId,
 * POST /api/organizations/:id/invite, GET /api/organizations/:id/settings.
 */
export default function OrgUsers() {
  const { user, isOrgAdmin } = useAuth();
  const { activeOrganizationId, activeOrganization, isManager } = useOrganization();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, error, refetch } = useOrgUsers(activeOrganizationId);
  const { data: settingsData } = useOrgSettings(activeOrganizationId);
  const inviteCode = settingsData?.organization?.inviteCode || activeOrganization?.inviteCode || null;

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [pendingRole, setPendingRole] = useState(null);
  const [savingRole, setSavingRole] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const users = data?.users || [];
  const total = data?.total ?? users.length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((member) => {
      if (roleFilter && member.role !== roleFilter) return false;
      if (!term) return true;
      return [member.name, member.email, member.role].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [users, search, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts = {};
    users.forEach((m) => { counts[m.role] = (counts[m.role] || 0) + 1; });
    return counts;
  }, [users]);

  const confirmRoleChange = async () => {
    if (!pendingRole) return;
    setSavingRole(true);
    try {
      const res = await api.updateUserRole(activeOrganizationId, pendingRole.user.id, pendingRole.nextRole);
      toast.success(res?.message || 'Role updated');
      setPendingRole(null);
      qc.invalidateQueries({ queryKey: ['org-users', activeOrganizationId] });
    } catch (err) {
      toast.error(err?.message || 'Could not update the role');
    } finally {
      setSavingRole(false);
    }
  };

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast.success('Invite code copied to your clipboard');
    } catch {
      toast.error('Could not copy the invite code — select and copy it manually');
    }
  };

  return (
    <div>
      <PageHeader
        title="Members & staff"
        subtitle={`Everyone with access to ${activeOrganization?.name || 'this organization'}`}
        actions={isManager && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite member
          </Button>
        )}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Members"
          value={total}
          icon={<Users className="h-5 w-5" />}
          color="sky"
          loading={isLoading}
          description="In this organization"
        />
        <StatCard
          label="Managers"
          value={(roleCounts.admin || 0) + (roleCounts.owner || 0)}
          icon={<ShieldCheck className="h-5 w-5" />}
          color="violet"
          loading={isLoading}
          description="Owners and admins"
        />
        <StatCard
          label="Staff &amp; security"
          value={(roleCounts.staff || 0) + (roleCounts.security || 0)}
          icon={<Check className="h-5 w-5" />}
          color="emerald"
          loading={isLoading}
          description="Can work the recovery queues"
        />
        <StatCard
          label="Verified emails"
          value={users.filter((m) => m.isVerified).length}
          icon={<Mail className="h-5 w-5" />}
          color="amber"
          loading={isLoading}
          description="Confirmed email addresses"
        />
      </div>

      <div className="card-surface mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name, email or role…"
            className="w-full rounded-full border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
        >
          <option value="">All roles</option>
          {['owner', ...ASSIGNABLE_ROLES.map((r) => r.value)].map((role) => (
            <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>
          ))}
        </select>
        {inviteCode && (
          <button
            onClick={copyInviteCode}
            className="inline-flex items-center gap-2 rounded-full border border-dashed border-brand-300 bg-brand-50/60 px-4 py-2.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50"
            title="Copy the join code"
          >
            <span className="font-mono">{inviteCode}</span>
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isError && (
        <ErrorState error={error} onRetry={() => refetch()} />
      )}

      {isLoading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : (
        !isError && (
          users.length === 0 ? (
            <div className="card-surface">
              <EmptyState
                illustration="👥"
                title="This organization has no members yet"
                description="Invite the first person to start reporting lost and found items together."
                actionLabel={isManager ? 'Invite a member' : undefined}
                onAction={isManager ? () => setInviteOpen(true) : undefined}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card-surface">
              <EmptyState
                compact
                illustration="🔍"
                title="No members match your filters"
                description="Try a different name, email, or clear the role filter."
                actionLabel="Clear filters"
                onAction={() => { setSearch(''); setRoleFilter(''); }}
              />
            </div>
          ) : (
            <div className="card-surface overflow-hidden">
              <div className="overflow-x-auto">
                {/* Fixed column widths keep the header and body perfectly aligned. */}
                <table className="w-full min-w-[820px] table-fixed text-left">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[26%]" />
                    <col className="w-[16%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-3">Member</th>
                      <th className="px-3 py-3">Email</th>
                      <th className="px-3 py-3">Role</th>
                      <th className="px-3 py-3">Joined</th>
                      <th className="px-5 py-3 text-right">Change role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map((member, i) => {
                      const isSelf = String(member.id) === String(user?.id);
                      return (
                        <motion.tr
                          key={member.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.15, delay: Math.min(i * 0.015, 0.2) }}
                          className="transition hover:bg-brand-50/40"
                        >
                          <td className="px-5 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-700">
                                {initialsOf(member.name || member.email)}
                              </span>
                              <div className="min-w-0">
                                <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
                                  <span className="truncate">{member.name || 'Unnamed member'}</span>
                                  {isSelf && (
                                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">you</span>
                                  )}
                                </p>
                                {member.active && (
                                  <p className="text-[11px] font-semibold text-brand-600">Active organization</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-1.5 truncate text-sm text-slate-600">
                              {member.email}
                              {member.isVerified
                                ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Verified email" />
                                : <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">unverified</span>}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold', roleTone(member.role))}>
                              {member.role || 'member'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-500">{formatDate(member.joinedAt)}</td>
                          <td className="px-5 py-3 text-right">
                            {member.role === 'owner' || isSelf || !isOrgAdmin ? (
                              <span className="text-[11px] font-semibold text-slate-400">
                                {member.role === 'owner' ? 'Owner role is fixed' : isSelf ? 'You cannot change your own role' : 'Admins only'}
                              </span>
                            ) : (
                              <select
                                value={member.role}
                                onChange={(e) => {
                                  if (e.target.value !== member.role) {
                                    setPendingRole({ user: member, nextRole: e.target.value });
                                  }
                                }}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-brand-300 focus:outline-none"
                              >
                                {member.role === 'owner' && <option value="owner">Owner</option>}
                                {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )
      )}

      {!isManager && !isLoading && (
        <p className="mt-4 text-xs text-slate-400">
          Only organization owners and admins can invite members or change roles.
        </p>
      )}

      <ConfirmDialog
        open={Boolean(pendingRole)}
        onClose={() => setPendingRole(null)}
        onConfirm={confirmRoleChange}
        loading={savingRole}
        tone="primary"
        title={`Change ${pendingRole?.user?.name || 'this member'}'s role?`}
        description={pendingRole
          ? `They will become a ${pendingRole.nextRole} in ${activeOrganization?.name || 'this organization'}. ${ASSIGNABLE_ROLES.find((r) => r.value === pendingRole.nextRole)?.blurb || ''} They are notified about the change.`
          : ''}
        confirmLabel="Change role"
      />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        orgId={activeOrganizationId}
        orgName={activeOrganization?.name}
        inviteCode={inviteCode}
        onInvited={() => qc.invalidateQueries({ queryKey: ['org-users', activeOrganizationId] })}
      />
    </div>
  );
}

/**
 * Invite form. The API is honest about what it did: when the email has no
 * account it records the intent and answers `pending: true` with the join code,
 * so we surface that verbatim instead of pretending an email was delivered.
 */
function InviteModal({ open, onClose, orgId, orgName, inviteCode, onInvited }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [formError, setFormError] = useState('');

  const reset = () => {
    setEmail('');
    setRole('member');
    setResult(null);
    setFormError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    setResult(null);
    setSending(true);
    try {
      const res = await api.inviteUser(orgId, { email: email.trim(), role });
      setResult(res);
      toast.success(res?.message || 'Invitation recorded');
      onInvited?.();
    } catch (err) {
      setFormError(err?.message || 'Could not send the invitation');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={`Invite someone to ${orgName || 'this organization'}`}
      description="They will get access with the role you pick. Everyone else keeps their current role."
      footer={(
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {!result && (
            <Button type="submit" form="invite-form" loading={sending}>
              Send invitation
            </Button>
          )}
        </>
      )}
    >
      {result ? (
        <div className="space-y-4">
          <div className={cn(
            'rounded-xl border p-4',
            result.pending ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
          )}
          >
            <p className={cn('text-sm font-bold', result.pending ? 'text-amber-800' : 'text-emerald-800')}>
              {result.pending ? 'Recorded — not emailed yet' : 'Member added'}
            </p>
            <p className={cn('mt-1 text-sm leading-relaxed', result.pending ? 'text-amber-700' : 'text-emerald-700')}>
              {result.message}
            </p>
          </div>

          {result.pending && (
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {email.trim()} has no LostLink AI account
              </p>
              <p className="mt-1.5 text-sm text-slate-600">
                No mailer is configured in this build, so the invitation was stored as an intent and logged in the
                audit trail. Share the join code below — the person can register with it and land in{' '}
                {orgName || 'this organization'} straight away.
              </p>
              {result.inviteCode && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 font-mono text-sm font-bold text-white">
                  {result.inviteCode}
                </p>
              )}
            </div>
          )}

          {!result.pending && result.user && (
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Added</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{result.user.name}</p>
              <p className="text-xs text-slate-500">{result.user.email} · {role}</p>
            </div>
          )}

          <Button variant="secondary" onClick={reset}>Invite someone else</Button>
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@organization.com"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Role</span>
            <div className="space-y-2">
              {ASSIGNABLE_ROLES.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
                    role === r.value ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                    className="mt-1 accent-[#0d9488]"
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-800">{r.label}</span>
                    <span className="block text-xs text-slate-500">{r.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {inviteCode && (
            <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
              Join code <span className="font-mono font-bold text-slate-800">{inviteCode}</span> — shared with the
              invitee so they can join even if they have not registered yet.
            </p>
          )}

          {formError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{formError}</p>
          )}
        </form>
      )}
    </Modal>
  );
}
