// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SeriesHeaderRow } from '@/lib/library-groups';
import { renderWithSkeudenn } from '@/test/skeudenn';
import { SeriesHeader } from './series-header';

afterEach(cleanup);

function heading(overrides: Partial<SeriesHeaderRow> = {}): SeriesHeaderRow {
  return {
    kind: 'series',
    key: 'saga',
    series: 'Saga',
    count: 3,
    finished: 1,
    ids: ['a', 'b', 'c'],
    collapsed: false,
    missing: [],
    ...overrides,
  };
}

function show(row: SeriesHeaderRow) {
  return renderWithSkeudenn(
    <ul>
      <SeriesHeader row={row} ref={() => undefined} index={0} start={0} onToggle={() => undefined} selectedCount={0} onSelect={() => undefined} />
    </ul>,
  );
}

describe('SeriesHeader', () => {
  it('shows the missing volumes after the reading progress', () => {
    show(heading({ missing: [4, 6] }));
    expect(screen.getByText('Lus : 1 / 3')).toBeTruthy();
    expect(screen.getByText('Manquants : 4, 6')).toBeTruthy();
  });

  it('shortens consecutive volumes to a range', () => {
    show(heading({ missing: [2, 3, 4, 5, 9] }));
    expect(screen.getByText('Manquants : 2–5, 9')).toBeTruthy();
  });

  it('cuts a long list with a count and keeps the full list in the tooltip', () => {
    show(heading({ missing: [2, 3, 4, 5, 9, 12, 14, 16, 17, 18, 21] }));
    const text = screen.getByText('Manquants : 2–5, 9, 12, 14, 16–18… (+1)');
    expect(text.getAttribute('title')).toContain('2–5, 9, 12, 14, 16–18, 21');
  });

  it('shows nothing when there is no gap', () => {
    show(heading());
    expect(screen.queryByText(/Manquants/)).toBeNull();
  });
});
