import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { formatMissingVolumes } from '@/lib/missing-volumes';
import { cn } from '@/lib/utils';
import type { SeriesHeaderRow } from '@/lib/library-groups';

/** A series heading of the grouped view: folds or unfolds its books on click. */
export function SeriesHeader({
  row,
  ref,
  index,
  start,
  onToggle,
  selectedCount,
  onSelect,
}: {
  row: SeriesHeaderRow;
  ref: (element: HTMLLIElement | null) => void;
  index: number;
  start: number;
  onToggle: () => void;
  /** How many of the series' books are ticked. */
  selectedCount: number;
  /** Ticks every book of the series, or unticks them when they all are. */
  onSelect: () => void;
}) {
  const { t } = useTranslation('library');
  const name = row.series ?? t('noSeries');
  const Chevron = row.collapsed ? ChevronRight : ChevronDown;
  const missing = formatMissingVolumes(row.missing);
  return (
    <li
      ref={ref}
      data-index={index}
      style={{ transform: `translateY(${start}px)` }}
      className="absolute top-0 left-0 flex w-full items-center border-b bg-muted/50"
    >
      <input
        type="checkbox"
        ref={(input) => {
          if (input) input.indeterminate = selectedCount > 0 && selectedCount < row.ids.length;
        }}
        checked={row.ids.length > 0 && selectedCount === row.ids.length}
        onChange={onSelect}
        title={t('selectSeriesHint')}
        aria-label={t('selectSeries', { series: name })}
        className="ml-3 size-4 shrink-0 cursor-pointer"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!row.collapsed}
        aria-label={t(row.collapsed ? 'expandSeries' : 'collapseSeries', { series: name })}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-accent"
      >
        <Chevron className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn('min-w-0 truncate font-semibold', row.series === null && 'text-muted-foreground italic')}>
          {name}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {t('seriesProgress', { finished: row.finished, count: row.count })}
        </span>
        {row.missing.length > 0 && (
          <span
            title={t('seriesMissingHint', { list: missing.full })}
            className="min-w-0 shrink truncate text-xs text-muted-foreground"
          >
            {missing.hidden > 0
              ? t('seriesMissingMore', { list: missing.shown, count: missing.hidden })
              : t('seriesMissing', { list: missing.shown })}
          </span>
        )}
      </button>
    </li>
  );
}
