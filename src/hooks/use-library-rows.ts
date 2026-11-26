/**
 * What the library page draws, derived from the library and the page's filters.
 * @module
 */
import { useMemo, useState } from 'react';

import { availableLanguages, availableTags, filterEntries, type LibraryFilters } from '@/lib/library-filter';
import { collapseEditions, editionGroups } from '@/lib/library-editions';
import { groupBySeries, missingVolumesBySeries, ungroupedRows, type LibraryRow } from '@/lib/library-groups';
import { sortEntries } from '@/lib/library-sort';
import { QUICK_TAGS } from '@/lib/reading-list';
import type { LibraryEntry } from '@/shared/library';
import type { LibrarySort } from '@/shared/settings';

/** What {@link useLibraryRows} returns. */
export interface LibraryRows {
  /** For each book that exists in several formats, its files (see `editionGroups()`). */
  editions: Map<string, LibraryEntry[]>;
  /** The books left by the filters, one per book whatever its formats, before sorting or grouping. */
  visible: LibraryEntry[];
  /** The tags the filter can offer, the quick tags first. */
  tags: string[];
  /** The languages the filter can offer (codes), by name. */
  languages: string[];
  /** The rows in the order they are drawn: series headings and books, or books only. */
  rows: LibraryRow[];
  /** The books of `rows`, in the same order (folded series left out). */
  shown: LibraryEntry[];
  /** Folds or unfolds a series of the grouped view. */
  toggleSeries: (key: string) => void;
}

/**
 * Filters, sorts and groups the library for the page. `filters` is meant to be the deferred copy of
 * the page's state, so typing in the search field never waits for this. The folded series are kept
 * for the life of the page only, a new key (a series renamed) starting unfolded.
 */
export function useLibraryRows(
  entries: LibraryEntry[],
  filters: LibraryFilters,
  grouped: boolean,
  sort: LibrarySort,
): LibraryRows {
  // The same book in several formats (a CBZ and a PDF) is one row; its other files are its editions.
  const editions = useMemo(() => editionGroups(entries), [entries]);
  const visible = useMemo(() => collapseEditions(filterEntries(entries, filters), editions), [entries, filters, editions]);
  const tags = useMemo(() => availableTags(entries, QUICK_TAGS), [entries]);
  const languages = useMemo(() => availableLanguages(entries), [entries]);
  const [collapsedSeries, setCollapsedSeries] = useState<ReadonlySet<string>>(() => new Set());
  // The gaps come from the whole library, so a filter hiding a volume doesn't report it as missing;
  // computed once per library change, not on each keystroke of the search.
  const missing = useMemo(() => (grouped ? missingVolumesBySeries(entries) : new Map<string, number[]>()), [grouped, entries]);
  const rows = useMemo(
    () => (grouped ? groupBySeries(visible, collapsedSeries, missing) : ungroupedRows(sortEntries(visible, sort))),
    [grouped, visible, collapsedSeries, missing, sort],
  );
  const toggleSeries = (key: string) =>
    setCollapsedSeries((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  // The order of a Shift-click range, of "select all" and of the books sent to a reading list.
  const shown = useMemo(() => rows.flatMap((row) => (row.kind === 'entry' ? [row.entry] : [])), [rows]);
  return { editions, visible, tags, languages, rows, shown, toggleSeries };
}
