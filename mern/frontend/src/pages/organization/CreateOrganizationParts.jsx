import { useRef, useState } from 'react';
import { ImagePlus, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import OrgMark from '../../components/OrgMark';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';

/**
 * One wizard step: a titled card with a consistent internal rhythm.
 * A step asks ONE group of questions, so every step uses the same shell.
 */
export function StageCard({ title, hint, children, className }) {
  return (
    <section className={cn('rounded-2xl bg-white p-5 shadow-soft sm:p-6', className)}>
      <h2 className="text-base font-bold text-brand-ink">{title}</h2>
      {hint && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{hint}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

/**
 * The step's action bar. Sticky at the bottom on small screens so Continue is
 * always reachable with one hand without scrolling past the form.
 */
export function FieldActions({ children }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-5 bg-gradient-to-t from-[#f7f9fb] via-[#f7f9fb] to-transparent px-5 pb-4 pt-3">
      {children}
    </div>
  );
}

/**
 * LogoPicker — optional organization logo.
 *
 * The image is downscaled in the browser to 256px and stored as a data URL on
 * `organization.logoUrl`. Two reasons: the API accepts a logoUrl on update and
 * nothing else, and a 256px mark is a few kilobytes instead of a few megabytes —
 * so the branding step cannot bloat a tenant document.
 */
export function LogoPicker({ value, onChange, name }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const downscale = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That file is not a readable image'));
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // Cover-fit into a square so a wide or tall logo is never distorted.
        const scale = Math.max(size / image.width, size / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Use a PNG, JPG or WebP image.');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await downscale(file);
      if (dataUrl.length > 400_000) {
        setError('That logo is too detailed to store. Try a simpler image.');
        return;
      }
      onChange(dataUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <OrgMark organization={{ name, logoUrl: value }} size="xl" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={busy}>
              <ImagePlus className="h-4 w-4" /> {value ? 'Replace logo' : 'Upload logo'}
            </Button>
            {value && (
              <Button variant="ghost" size="sm" onClick={() => onChange('')}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Square works best. Resized to 256px automatically.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={pick}
      />

      {busy && (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing your logo…
        </p>
      )}
      {error && (
        <p className="field-error flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
    </div>
  );
}

/** A labelled switch. `hint` explains the consequence, not the mechanic. */
export function Toggle({ icon: Icon, label, hint, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition',
        checked ? 'bg-brand-50/70' : 'bg-slate-50 hover:bg-slate-100'
      )}
    >
      {Icon && <Icon className={cn('h-4 w-4 shrink-0', checked ? 'text-brand-600' : 'text-slate-400')} />}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-slate-800">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-slate-500">{hint}</span>}
      </span>
      <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-slate-300')}>
        <span className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-all',
          checked ? 'left-[1.15rem]' : 'left-0.5'
        )} />
      </span>
    </button>
  );
}
