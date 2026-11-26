import { describe, expect, it } from 'vitest';

import {
  blockCount,
  blockIndexOf,
  blockPages,
  cellsSize,
  highestPage,
  isLandscapeSize,
  pageAfter,
  pageBefore,
  pagesLabel,
  spreadCells,
  spreadEnds,
  spreadOf,
  spreadPlacements,
  spreadsOf,
} from './book-spreads';
import { disabledAtEnds } from './reader-navigation';

const portrait = () => false;
/** A book whose given pages are landscape. */
const landscape = (...pages: number[]) => (page: number) => pages.includes(page);

describe('blocks', () => {
  it('count the cover alone, then the pairs', () => {
    expect(blockCount(14, true)).toBe(8); // [0] [1,2] [3,4] [5,6] [7,8] [9,10] [11,12] [13]
    expect(blockCount(13, true)).toBe(7); // [0] [1,2] … [11,12]
    expect(blockCount(1, true)).toBe(1);
    expect(blockCount(2, true)).toBe(2);
    expect(blockCount(0, true)).toBe(0);
  });

  it('count the pairs from the first page without the cover', () => {
    expect(blockCount(14, false)).toBe(7);
    expect(blockCount(13, false)).toBe(7);
    expect(blockCount(1, false)).toBe(1);
    expect(blockCount(0, false)).toBe(0);
  });

  it('pair the pages by index parity', () => {
    expect([0, 1, 2, 3, 4, 5].map((page) => blockIndexOf(page, true))).toEqual([0, 1, 1, 2, 2, 3]);
    expect([0, 1, 2, 3, 4, 5].map((page) => blockIndexOf(page, false))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(blockPages(0, 14, true)).toEqual([0]);
    expect(blockPages(1, 14, true)).toEqual([1, 2]);
    expect(blockPages(7, 14, true)).toEqual([13]);
    expect(blockPages(0, 14, false)).toEqual([0, 1]);
    expect(blockPages(6, 14, false)).toEqual([12, 13]);
    expect(blockPages(6, 13, false)).toEqual([12]);
    expect(blockPages(8, 14, true)).toEqual([]);
    expect(blockPages(-1, 14, true)).toEqual([]);
  });

  it('hold every page exactly once', () => {
    for (const coverAlone of [true, false]) {
      for (const pageCount of [1, 2, 3, 10, 11]) {
        const pages = Array.from({ length: blockCount(pageCount, coverAlone) }, (_, block) =>
          blockPages(block, pageCount, coverAlone),
        ).flat();
        expect(pages).toEqual(Array.from({ length: pageCount }, (_, page) => page));
        for (const page of pages) {
          expect(blockPages(blockIndexOf(page, coverAlone), pageCount, coverAlone)).toContain(page);
        }
      }
    }
  });
});

describe('spreadOf', () => {
  it('shows the cover alone, then the pairs', () => {
    expect(spreadOf(0, 14, true, portrait)).toEqual([0]);
    expect(spreadOf(1, 14, true, portrait)).toEqual([1, 2]);
    expect(spreadOf(2, 14, true, portrait)).toEqual([1, 2]);
    expect(spreadOf(3, 14, true, portrait)).toEqual([3, 4]);
  });

  it('pairs from the first page without the cover alone', () => {
    expect(spreadOf(0, 14, false, portrait)).toEqual([0, 1]);
    expect(spreadOf(1, 14, false, portrait)).toEqual([0, 1]);
    expect(spreadOf(2, 14, false, portrait)).toEqual([2, 3]);
  });

  it('leaves an odd last page alone', () => {
    expect(spreadOf(13, 14, true, portrait)).toEqual([13]);
    expect(spreadOf(12, 13, false, portrait)).toEqual([12]);
    expect(spreadOf(11, 13, true, portrait)).toEqual([11, 12]);
  });

  it('is the page itself for a one-page book', () => {
    expect(spreadOf(0, 1, true, portrait)).toEqual([0]);
    expect(spreadOf(0, 1, false, portrait)).toEqual([0]);
  });

  it('shows a landscape page alone, and the page it was paired with alone too', () => {
    expect(spreadOf(3, 14, true, landscape(3))).toEqual([3]);
    expect(spreadOf(4, 14, true, landscape(3))).toEqual([4]);
    expect(spreadOf(3, 14, true, landscape(4))).toEqual([3]);
    expect(spreadOf(4, 14, true, landscape(4))).toEqual([4]);
    // The neighbouring blocks are untouched.
    expect(spreadOf(2, 14, true, landscape(3))).toEqual([1, 2]);
    expect(spreadOf(5, 14, true, landscape(3))).toEqual([5, 6]);
  });

  it('keeps a landscape cover alone, as it is', () => {
    expect(spreadOf(0, 14, true, landscape(0))).toEqual([0]);
    expect(spreadOf(0, 14, false, landscape(0))).toEqual([0]);
    expect(spreadOf(1, 14, false, landscape(0))).toEqual([1]);
  });
});

describe('spreadsOf', () => {
  it('lists the spreads in reading order', () => {
    expect(spreadsOf(6, true, portrait)).toEqual([[0], [1, 2], [3, 4], [5]]);
    expect(spreadsOf(6, false, portrait)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
    expect(spreadsOf(1, true, portrait)).toEqual([[0]]);
    expect(spreadsOf(0, true, portrait)).toEqual([]);
  });

  it('splits the blocks holding a landscape page', () => {
    expect(spreadsOf(6, true, landscape(2))).toEqual([[0], [1], [2], [3, 4], [5]]);
    expect(spreadsOf(6, true, landscape(2))).toHaveLength(5);
  });

  it('agrees with spreadOf for every page', () => {
    const isLandscape = landscape(2, 7);
    const spreads = spreadsOf(11, true, isLandscape);
    for (let page = 0; page < 11; page++) {
      expect(spreads).toContainEqual(spreadOf(page, 11, true, isLandscape));
    }
  });
});

describe('moving between spreads', () => {
  it('goes to the page after the last one of the spread and before the first one', () => {
    expect(pageAfter([1, 2], 14)).toBe(3);
    expect(pageBefore([3, 4])).toBe(2);
    expect(pageAfter([0], 14)).toBe(1);
    expect(pageBefore([1, 2])).toBe(0);
  });

  it('stops at the ends of the book', () => {
    expect(pageBefore([0])).toBeNull();
    expect(pageBefore([0, 1])).toBeNull();
    expect(pageAfter([13], 14)).toBeNull();
    expect(pageAfter([12, 13], 14)).toBeNull();
  });

  it('walks a split block one page at a time', () => {
    const spread = spreadOf(3, 14, true, landscape(4));
    expect(spread).toEqual([3]);
    expect(pageAfter(spread, 14)).toBe(4);
    expect(spreadOf(4, 14, true, landscape(4))).toEqual([4]);
  });

  it('says whether a spread starts or ends the book', () => {
    expect(spreadEnds([0], 14)).toEqual({ isFirst: true, isLast: false });
    expect(spreadEnds([5, 6], 14)).toEqual({ isFirst: false, isLast: false });
    expect(spreadEnds([12, 13], 14)).toEqual({ isFirst: false, isLast: true });
    expect(spreadEnds([0], 1)).toEqual({ isFirst: true, isLast: true });
  });

  it('disables the controls at the ends, on the side the direction puts them', () => {
    const first = spreadEnds([0], 14);
    const last = spreadEnds([13], 14);
    expect(disabledAtEnds('ltr', first.isFirst, first.isLast)).toEqual({ isPrevDisabled: true, isNextDisabled: false });
    expect(disabledAtEnds('ltr', last.isFirst, last.isLast)).toEqual({ isPrevDisabled: false, isNextDisabled: true });
    expect(disabledAtEnds('rtl', first.isFirst, first.isLast)).toEqual({ isPrevDisabled: false, isNextDisabled: true });
    expect(disabledAtEnds('rtl', last.isFirst, last.isLast)).toEqual({ isPrevDisabled: true, isNextDisabled: false });
  });
});

describe('the page saved', () => {
  it('is the highest page of the spread', () => {
    expect(highestPage([0])).toBe(0);
    expect(highestPage([3, 4])).toBe(4);
    // The last spread marks the last page reached.
    const spreads = spreadsOf(14, true, portrait);
    expect(highestPage(spreads[spreads.length - 1])).toBe(13);
    const even = spreadsOf(14, false, portrait);
    expect(highestPage(even[even.length - 1])).toBe(13);
  });
});

describe('pagesLabel', () => {
  it('writes a pair as a range and a lone page as itself', () => {
    expect(pagesLabel([3, 4])).toBe('4–5');
    expect(pagesLabel([13])).toBe('14');
    expect(pagesLabel([0])).toBe('1');
  });
});

describe('isLandscapeSize', () => {
  it('is true only for a page wider than tall', () => {
    expect(isLandscapeSize({ width: 1600, height: 1200 })).toBe(true);
    expect(isLandscapeSize({ width: 800, height: 1200 })).toBe(false);
    expect(isLandscapeSize({ width: 1000, height: 1000 })).toBe(false);
  });
});

describe('spreadPlacements', () => {
  it('puts the lower page on the left in LTR and on the right in RTL', () => {
    expect(spreadPlacements([1, 2], true, 'ltr', portrait)).toEqual([
      { page: 1, side: 'left' },
      { page: 2, side: 'right' },
    ]);
    expect(spreadPlacements([1, 2], true, 'rtl', portrait)).toEqual([
      { page: 2, side: 'left' },
      { page: 1, side: 'right' },
    ]);
  });

  it('puts the cover on the right half in LTR and on the left one in RTL', () => {
    expect(spreadPlacements([0], true, 'ltr', portrait)).toEqual([{ page: 0, side: 'right' }]);
    expect(spreadPlacements([0], true, 'rtl', portrait)).toEqual([{ page: 0, side: 'left' }]);
  });

  it('puts the last odd page on the half opposite to the cover', () => {
    expect(spreadPlacements([13], true, 'ltr', portrait)).toEqual([{ page: 13, side: 'left' }]);
    expect(spreadPlacements([13], true, 'rtl', portrait)).toEqual([{ page: 13, side: 'right' }]);
    expect(spreadPlacements([12], false, 'ltr', portrait)).toEqual([{ page: 12, side: 'left' }]);
  });

  it('centres a landscape page', () => {
    expect(spreadPlacements([3], true, 'ltr', landscape(3))).toEqual([{ page: 3, side: 'center' }]);
    expect(spreadPlacements([3], true, 'rtl', landscape(3))).toEqual([{ page: 3, side: 'center' }]);
  });

  it('keeps the half a page had in its pair when its partner is landscape', () => {
    // [3, 4] with 4 landscape: 3 stays on the left in LTR; [3, 4] with 3 landscape: 4 on the right.
    expect(spreadPlacements([3], true, 'ltr', landscape(4))).toEqual([{ page: 3, side: 'left' }]);
    expect(spreadPlacements([4], true, 'ltr', landscape(3))).toEqual([{ page: 4, side: 'right' }]);
    expect(spreadPlacements([3], true, 'rtl', landscape(4))).toEqual([{ page: 3, side: 'right' }]);
  });
});

describe('spreadCells and cellsSize', () => {
  const sizes: Record<number, { width: number; height: number }> = {
    0: { width: 800, height: 1200 },
    1: { width: 800, height: 1200 },
    2: { width: 900, height: 1300 },
    3: { width: 1600, height: 1200 },
  };
  const sizeOf = (page: number) => sizes[page];

  it('lays a pair out side by side at their own sizes', () => {
    const cells = spreadCells(spreadPlacements([1, 2], true, 'ltr', portrait), sizeOf);
    expect(cells.map((cell) => cell.page)).toEqual([1, 2]);
    expect(cellsSize(cells)).toEqual({ width: 1700, height: 1300 });
  });

  it('mirrors the pair in RTL', () => {
    const cells = spreadCells(spreadPlacements([1, 2], true, 'rtl', portrait), sizeOf);
    expect(cells.map((cell) => cell.page)).toEqual([2, 1]);
  });

  it('gives a lone page an empty half, so the spine stays at the centre', () => {
    const ltr = spreadCells(spreadPlacements([0], true, 'ltr', portrait), sizeOf);
    expect(ltr.map((cell) => cell.page)).toEqual([null, 0]);
    expect(cellsSize(ltr)).toEqual({ width: 1600, height: 1200 });
    const rtl = spreadCells(spreadPlacements([0], true, 'rtl', portrait), sizeOf);
    expect(rtl.map((cell) => cell.page)).toEqual([0, null]);
  });

  it('uses the whole width for a landscape page', () => {
    const cells = spreadCells(spreadPlacements([3], true, 'ltr', landscape(3)), sizeOf);
    expect(cells.map((cell) => cell.page)).toEqual([3]);
    expect(cellsSize(cells)).toEqual({ width: 1600, height: 1200 });
  });
});
