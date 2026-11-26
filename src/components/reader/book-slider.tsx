import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppSettings } from '@/shared/settings';

interface BookSliderProps {
  /** How many fixed blocks of pages (see `book-spreads.ts`) the book has: the slider's positions. */
  blockCount: number;
  /** The block shown now. */
  block: number;
  direction: AppSettings['readingDirection'];
  /** The pages of a block, as the tooltip writes them. */
  labelOf: (block: number) => string;
  /** Goes to a block. */
  onJump: (block: number) => void;
}

/**
 * The slider along the bottom of the book reader: it jumps to a spread (reversed in right-to-left
 * reading), with the pages the position stands for in a tooltip while it is dragged. A drag only
 * jumps when it is released, so crossing the book doesn't read every spread on the way.
 */
export function BookSlider({ blockCount, block, direction, labelOf, onJump }: BookSliderProps) {
  const { t } = useTranslation('reader');
  const [preview, setPreview] = useState<number | null>(null);
  const dragging = useRef(false);
  const last = Math.max(blockCount - 1, 0);
  const shown = preview ?? block;
  const toValue = (position: number) => (direction === 'rtl' ? last - position : position);
  const fromValue = toValue; // the mapping is its own inverse

  const finish = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (preview !== null && preview !== block) onJump(preview);
    setPreview(null);
  };

  return (
    <div className="relative flex-1">
      {preview !== null && (
        <span
          role="tooltip"
          className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-black"
          style={{ left: `${last === 0 ? 0 : (toValue(preview) / last) * 100}%` }}
        >
          {labelOf(preview)}
        </span>
      )}
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={toValue(shown)}
        disabled={blockCount <= 1}
        aria-label={t('slider')}
        aria-valuetext={labelOf(shown)}
        onPointerDown={() => {
          dragging.current = true;
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onBlur={() => {
          dragging.current = false;
          setPreview(null);
        }}
        onChange={(event) => {
          const position = fromValue(Number(event.target.value));
          if (dragging.current) setPreview(position);
          else if (position !== block) onJump(position);
        }}
        className="block w-full accent-white"
      />
    </div>
  );
}
