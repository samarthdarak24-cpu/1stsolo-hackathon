import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { initialsOf } from '../lib/format';
import { cn } from '../lib/cn';

/**
 * OrganizationSelector — switches the active organization.
 * Persists the change server-side and refetches the whole app under the new tenant.
 */
export default function OrganizationSelector({ className, compact = false }) {
  const { organizations, activeOrganization, switchOrg, role } = useOrganization();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const select = async (orgId) => {
    if (orgId === activeOrganization?.id) { setOpen(false); return; }
    setSwitching(orgId);
    try {
      await switchOrg(orgId);
    } finally {
      setSwitching(null);
      setOpen(false);
    }
  };

  const label = activeOrganization?.name || 'Select organization';

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-brand-200 hover:bg-brand-50/40',
          compact && 'w-auto'
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-800">{label}</span>
          {role && <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{role}</span>}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop">
          <p className="border-b border-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Your organizations</p>
          {organizations.length === 0 && (
            <p className="px-3 py-4 text-sm text-slate-500">You are not a member of any organization yet.</p>
          )}
          {organizations.map(org => (
            <button
              key={org.id}
              onClick={() => select(org.id)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50',
                org.id === activeOrganization?.id && 'bg-brand-50/60'
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600">
                {initialsOf(org.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{org.name}</span>
                <span className="block text-xs capitalize text-slate-400">{org.role} · {org.type}</span>
              </span>
              {switching === org.id
                ? <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                : org.id === activeOrganization?.id && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
            Signed in as {user?.email}
          </p>
        </div>
      )}
    </div>
  );
}
