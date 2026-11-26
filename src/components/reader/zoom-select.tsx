import { ZoomIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ZOOM_OPTIONS, type Zoom } from '@/lib/reader-zoom';

/** The zoom menu of the page-by-page and book readers: fit, then fractions of the actual size. */
export function ZoomSelect({ value, onChange }: { value: Zoom; onChange: (zoom: Zoom) => void }) {
  const { t } = useTranslation('reader');
  return (
    <label className="flex items-center gap-1.5 text-white/60">
      <ZoomIn className="size-4" />
      <span className="sr-only">{t('zoom')}</span>
      <select
        value={String(value)}
        onChange={(event) => onChange(event.target.value === 'fit' ? 'fit' : Number(event.target.value))}
        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white [color-scheme:dark]"
      >
        {ZOOM_OPTIONS.map((option) => (
          <option key={option} value={option} className="bg-neutral-900 text-white">
            {option === 'fit'
              ? t('zoomFit')
              : option === 1
                ? t('zoomActual')
                : t('zoomPercent', { percent: Math.round(option * 100) })}
          </option>
        ))}
      </select>
    </label>
  );
}
