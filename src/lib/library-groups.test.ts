import { describe, expect, it } from 'vitest';

import { gridLines, groupBySeries, missingVolumesBySeries, NO_SERIES_KEY, seriesKey, ungroupedRows, type LibraryRow } from './library-groups';
import type { LibraryEntry } from '@/shared/library';

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'id',
    path: 'C:/comics/book.cbz',
    title: 'Book',
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

/** A compact picture of the rows: `# series (count)` for a heading, the entry id otherwise. */
function shape(rows: LibraryRow[]): string[] {
  return rows.map((row) => (row.kind === 'series' ? `# ${row.series ?? '-'} (${row.count})` : row.entry.id));
}

describe('groupBySeries', () => {
  it('puts each series behind a heading, alphabetically, the books without a series last', () => {
    const rows = groupBySeries([
      entry({ id: 'loose' }),
      entry({ id: 'tintin', series: 'Tintin' }),
      entry({ id: 'asterix', series: 'Astérix' }),
    ]);
    expect(shape(rows)).toEqual(['# Astérix (1)', 'asterix', '# Tintin (1)', 'tintin', '# - (1)', 'loose']);
  });

  it('sorts a series by volume in natural order, the books without a volume after, then by title', () => {
    const rows = groupBySeries([
      entry({ id: 'v10', series: 'S', volume: '10' }),
      entry({ id: 'none-b', series: 'S', title: 'B' }),
      entry({ id: 'v2', series: 'S', volume: '2' }),
      entry({ id: 'none-a', series: 'S', title: 'A' }),
      entry({ id: 'hs', series: 'S', volume: 'HS' }),
    ]);
    expect(shape(rows)).toEqual(['# S (5)', 'v2', 'v10', 'hs', 'none-a', 'none-b']);
  });

  it('merges series that differ only by case or surrounding spaces, keeping the first spelling', () => {
    const rows = groupBySeries([entry({ id: 'a', series: 'Blacksad ' }), entry({ id: 'b', series: 'blacksad' })]);
    expect(shape(rows)).toEqual(['# Blacksad (2)', 'a', 'b']);
  });

  it('lists the ids of a series, even when it is folded', () => {
    const entries = [entry({ id: 'a', series: 'S' }), entry({ id: 'b', series: 'S' })];
    const [header] = groupBySeries(entries, new Set(['s']));
    expect(header).toMatchObject({ collapsed: true, ids: ['a', 'b'] });
  });

  it('counts the finished books of each series', () => {
    const [header] = groupBySeries([
      entry({ id: 'a', series: 'S', tags: ['Lu'] }),
      entry({ id: 'b', series: 'S', currentPage: 9 }),
      entry({ id: 'c', series: 'S' }),
    ]);
    expect(header).toMatchObject({ kind: 'series', count: 3, finished: 2, collapsed: false });
  });

  it('keeps only the heading of a collapsed series', () => {
    const rows = groupBySeries(
      [entry({ id: 'a', series: 'S' }), entry({ id: 'b' })],
      new Set([seriesKey('S'), NO_SERIES_KEY]),
    );
    expect(shape(rows)).toEqual(['# S (1)', '# - (1)']);
    expect(rows.every((row) => row.kind === 'series' && row.collapsed)).toBe(true);
  });

  it('gives nothing for an empty library', () => {
    expect(groupBySeries([])).toEqual([]);
  });
});

describe('ungroupedRows', () => {
  it('keeps the entries in their order, without headings', () => {
    expect(shape(ungroupedRows([entry({ id: 'b' }), entry({ id: 'a' })]))).toEqual(['b', 'a']);
  });
});

describe('gridLines', () => {
  const titles = (lines: ReturnType<typeof gridLines>) =>
    lines.map((line) =>
      line.kind === 'series' ? `# ${line.series}` : line.kind === 'cards' ? line.entries.map((e) => e.title).join(',') : '?',
    );

  it('cuts the books into lines of the given number of columns, the last one shorter', () => {
    const rows = ungroupedRows(['a', 'b', 'c', 'd', 'e'].map((title) => entry({ id: title, title })));
    expect(titles(gridLines(rows, 2))).toEqual(['a,b', 'c,d', 'e']);
  });

  it('starts a new line after each series heading', () => {
    const rows = groupBySeries([
      entry({ id: '1', title: 'a1', series: 'A' }),
      entry({ id: '2', title: 'a2', series: 'A' }),
      entry({ id: '3', title: 'b1', series: 'B' }),
    ]);
    expect(titles(gridLines(rows, 4))).toEqual(['# A', 'a1,a2', '# B', 'b1']);
  });

  it('keeps only the heading of a folded series and counts fewer than one column as one', () => {
    const rows = groupBySeries([entry({ id: '1', title: 'a1', series: 'A' }), entry({ id: '2', title: 'b1', series: 'B' })], new Set(['a']));
    expect(titles(gridLines(rows, 0))).toEqual(['# A', '# B', 'b1']);
  });
});

describe('missingVolumesBySeries', () => {
  it('lists the gaps of each series from the entries given', () => {
    const missing = missingVolumesBySeries([
      entry({ id: '1', series: 'Saga', volume: '1' }),
      entry({ id: '3', series: 'Saga', volume: '3' }),
      entry({ id: 'a', series: 'Complete', volume: '1' }),
      entry({ id: 'b', series: 'Complete', volume: '2' }),
      entry({ id: 'c', series: null, volume: '1' }),
      entry({ id: 'd', series: null, volume: '5' }),
    ]);
    expect([...missing]).toEqual([['saga', [2]]]);
  });

  it('shares the gaps between series names that differ by case or spaces', () => {
    const missing = missingVolumesBySeries([
      entry({ id: '1', series: 'Blacksad', volume: '1' }),
      entry({ id: '2', series: ' blacksad ', volume: '2' }),
      entry({ id: '4', series: 'BLACKSAD', volume: '4' }),
    ]);
    expect(missing.get('blacksad')).toEqual([3]);
    expect(missing.size).toBe(1);
  });
});

describe('groupBySeries missing volumes', () => {
  const library = [
    entry({ id: '1', title: 'T1', series: 'Saga', volume: '1' }),
    entry({ id: '2', title: 'T2', series: 'Saga', volume: '2' }),
    entry({ id: '4', title: 'T4', series: 'saga', volume: '4' }),
  ];

  it('gives each heading the gaps of its series', () => {
    const [header] = groupBySeries(library, new Set(), missingVolumesBySeries(library));
    expect(header).toMatchObject({ kind: 'series', missing: [3] });
  });

  it('has no gap for a series that is not in the map', () => {
    const [header] = groupBySeries(library);
    expect(header).toMatchObject({ kind: 'series', missing: [] });
  });

  it('does not report as missing a volume that a filter hides', () => {
    // T2 is hidden by a filter but is in the library: only T3 is missing.
    const filtered = library.filter((e) => e.id !== '2');
    const [header] = groupBySeries(filtered, new Set(), missingVolumesBySeries(library));
    expect(header).toMatchObject({ kind: 'series', count: 2, missing: [3] });
  });
});
