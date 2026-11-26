// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS } from '@/lib/library-filter';
import type { LibraryEntry } from '@/shared/library';
import { useLibraryRows } from './use-library-rows';

function entry(id: string, overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id,
    path: `/bd/${id}.cbz`,
    title: id,
    pageCount: 10,
    currentPage: 0,
    addedAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: '2026-01-01T00:00:00.000Z',
    fileCount: 10,
    fileSize: 1000,
    rating: 0,
    tags: [],
    titleLocked: false,
    series: null,
    volume: null,
    releaseDate: null,
    language: null,
    avgPageWidth: null,
    avgPageHeight: null,
    credits: [],
    ...overrides,
  };
}

const entries = [
  entry('b', { series: 'Saga', volume: '2' }),
  entry('a', { series: 'Saga', volume: '1' }),
  entry('c', { title: 'Other' }),
];

describe('useLibraryRows', () => {
  it('filters the books and lists them in the sort order', () => {
    const { result } = renderHook(() => useLibraryRows(entries, { ...EMPTY_FILTERS, search: 'saga' }, false, 'titleAsc'));
    expect(result.current.visible.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(result.current.shown.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('groups by series and folds a series down to its heading', () => {
    const { result } = renderHook(() => useLibraryRows(entries, EMPTY_FILTERS, true, 'lastOpened'));
    expect(result.current.rows.some((row) => row.kind === 'series')).toBe(true);
    expect(result.current.shown).toHaveLength(3);

    const heading = result.current.rows.find((row) => row.kind === 'series');
    if (heading?.kind !== 'series') throw new Error('no heading');
    act(() => result.current.toggleSeries(heading.key));
    expect(result.current.shown.map((e) => e.id)).toEqual(['c']);

    act(() => result.current.toggleSeries(heading.key));
    expect(result.current.shown).toHaveLength(3);
  });

  it('computes the missing volumes on the whole library, not on the filtered books', () => {
    const library = [
      entry('t1', { series: 'Saga', volume: '1', tags: ['mine'] }),
      entry('t2', { series: 'Saga', volume: '2' }),
      entry('t4', { series: 'Saga', volume: '4', tags: ['mine'] }),
    ];
    // The tag filter hides T2: it is not reported as missing, only T3 is.
    const { result } = renderHook(() => useLibraryRows(library, { ...EMPTY_FILTERS, tags: ['mine'] }, true, 'lastOpened'));
    const heading = result.current.rows.find((row) => row.kind === 'series');
    expect(heading).toMatchObject({ missing: [3], count: 2 });
  });
});
