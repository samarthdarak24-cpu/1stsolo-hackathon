import { Building2 } from 'lucide-react';
import { resolveUrl } from '../lib/api';
import { cn } from '../lib/cn';
import { initialsOf } from '../lib/format';

/**
 * OrgMark — an organization's identity at a glance.
 *
 * Every multi-tenant surface (sidebar, topbar, org header, selector) needs the
 * same answer to "which organization am I in?". Before this, each one invented
 * its own initials tile and the uploaded logo was stored but never rendered —
 * which is what made the product read as single-tenant.
 *
 * Falls back to initials, then to a generic building glyph, so the mark is never
 * an empty square.
 */
const SIZES = {
  sm: 'h-7 w-7 rounded-lg text-[10px]',
  md: 'h-9 w-9 rounded-xl text-xs',
  lg: 'h-12 w-12 rounded-2xl text-sm',
  xl: 'h-16 w-16 rounded-2xl text-lg'
};

export default function OrgMark({ organization, size = 'md', className }) {
  const url = organization?.logoUrl;
  const name = organization?.name || '';

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-brand-600 font-extrabold text-white',
        SIZES[size] || SIZES.md,
        className
      )}
      aria-hidden="true"
    >
      {url ? (
        <img src={resolveUrl(url)} alt="" className="h-full w-full object-cover" />
      ) : name ? (
        initialsOf(name)
      ) : (
        <Building2 className="h-4 w-4" />
      )}
    </span>
  );
}
