import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, X, Camera } from 'lucide-react';
import { cn } from '../../lib/cn';
import { resolveUrl } from '../../lib/api';

/**
 * ImageDrop — the photo step of the report wizard.
 *
 * Replaces the previous uploader, which faked its progress bar with a
 * setInterval and posted the whole file list at once. This one:
 *  - gives a large, obvious drop target (the photo step is the highest-friction
 *    step, so the target should be the largest control on the screen),
 *  - previews locally with object URLs and revokes them on removal,
 *  - reports a real pending state from the parent's upload promise,
 *  - validates type and size up front and states the limit in words.
 */
export default function ImageDrop({
  value = [],
  onAdd,
  onRemove,
  busy = false,
  max = 6,
  maxBytes = 5 * 1024 * 1024,
  accept = 'image/jpeg,image/png,image/webp',
  label = 'Add a photo',
  hint,
  // "Cover" only means something when several photos are allowed; a single-photo
  // picker (an avatar) passes false rather than mislabelling its only image.
  showCoverBadge = true,
  className
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const acceptLabel = 'JPG, PNG or WebP';
  const sizeLabel = `${Math.round(maxBytes / (1024 * 1024))} MB`;
  const full = value.length >= max;

  const handleFiles = useCallback((files) => {
    setError('');
    const picked = Array.from(files || []);
    if (!picked.length) return;

    if (value.length + picked.length > max) {
      // A single-photo picker (an avatar) has no room to add a second image, so
      // picking one REPLACES the current photo instead of failing with an error.
      if (max === 1 && value.length === 1) {
        onRemove?.(value[0], 0);
      } else {
        setError(`Up to ${max} photos per item.`);
        return;
      }
    }
    const wrongType = picked.find((f) => !accept.split(',').includes(f.type));
    if (wrongType) {
      setError(`That file is not an image. Use ${acceptLabel}.`);
      return;
    }
    const tooBig = picked.find((f) => f.size > maxBytes);
    if (tooBig) {
      setError(`That image is ${(tooBig.size / 1024 / 1024).toFixed(1)} MB. The limit is ${sizeLabel}.`);
      return;
    }
    onAdd?.(picked);
  }, [accept, max, maxBytes, onAdd, onRemove, value]);

  const open = () => inputRef.current?.click();

  return (
    <div className={cn('w-full', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={max > 1}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          // Cleared so re-picking the same file still fires a change event.
          e.target.value = '';
        }}
      />

      {value.length === 0 ? (
        <button
          type="button"
          onClick={open}
          disabled={busy}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
            dragging
              ? 'border-brand-400 bg-brand-50/70'
              : 'border-slate-200 bg-slate-50/60 hover:border-brand-300 hover:bg-brand-50/40',
            busy && 'pointer-events-none opacity-70'
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-xs">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </span>
          <span>
            <span className="block text-sm font-bold text-brand-ink">{busy ? 'Uploading…' : label}</span>
            <span className="mt-1 block text-xs text-slate-500">
              {hint || `Drag a photo here or browse. ${acceptLabel}, up to ${sizeLabel}.`}
            </span>
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          {/* The filled state accepts a drop too, so replacing a photo is the
              same gesture as adding the first one. */}
          <div
            className={cn(
              // `stagger-fast` means a batch of picked photos lands one after
              // another instead of the grid appearing in a single blink.
              'stagger-fast grid grid-cols-2 gap-3 rounded-2xl sm:grid-cols-3',
              dragging && 'ring-2 ring-brand-400'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          >
            {value.map((photo, index) => (
              <div key={photo.url || photo.id || index} className="group relative overflow-hidden rounded-2xl bg-slate-100">
                <img src={resolveUrl(photo.url)} alt={photo.name || 'Item photo'} className="aspect-square w-full object-cover" />
                {showCoverBadge && index === 0 && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-slate-900/75 px-2 py-0.5 text-[10px] font-bold text-white">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove?.(photo, index)}
                  disabled={busy}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-600 opacity-0 shadow-xs transition hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {!full && (
              <button
                type="button"
                onClick={open}
                disabled={busy}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-slate-400 transition',
                  dragging ? 'border-brand-400 bg-brand-50/70' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600'
                )}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                <span className="text-[11px] font-bold">Add</span>
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {showCoverBadge
              ? `${value.length} of ${max} photos · the first photo is the cover`
              : 'Drag a new photo onto the frame to replace this one.'}
          </p>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
