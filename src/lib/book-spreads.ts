/**
 * Spreads of the book reading mode: which pages are shown together, and where. Pure, so the pairing
 * rules can be tested.
 *
 * Pages are paired by index parity, which is fixed for a book: `[0]`, `[1, 2]`, `[3, 4]`… with the
 * cover alone, `[0, 1]`, `[2, 3]`… without. That fixed pairing is a *block*. A block is one spread,
 * unless one of its two pages is landscape (already a double page): the block is then split into one
 * spread per page. The orientation of a page is only known once it is decoded, so the helpers take it
 * as a predicate, and the spread holding a page can be computed from its index alone (resuming, the
 * slider and "go to page" never walk the book).
 * @module
 */
import type { Size } from '@/lib/reader-zoom';
import type { AppSettings } from '@/shared/settings';

/** Where a page sits in the spread: the left or right half, or the whole width for a landscape page. */
export type PageSide = 'left' | 'right' | 'center';

/** A page of a spread and the side it is drawn on. */
export interface SpreadPlacement {
  /** Page index (0-based). */
  page: number;
  /** Half of the spread the page occupies. */
  side: PageSide;
}

/** One cell of a laid-out spread, left to right: a page, or the empty half beside a lone page. */
export interface SpreadCell {
  /** Page index (0-based), or `null` for the empty half. */
  page: number | null;
  /** Natural width of the cell, in pixels. */
  width: number;
  /** Natural height of the cell, in pixels. */
  height: number;
}

/** Whether a page (by index) is landscape, i.e. wider than tall. */
export type IsLandscape = (page: number) => boolean;

/** Whether a decoded page is landscape: wider than it is tall. */
export function isLandscapeSize(size: Size): boolean {
  return size.width > size.height;
}

/** How many fixed blocks of pages (the pairs, the cover alone if wanted) a book of `pageCount` pages has. */
export function blockCount(pageCount: number, coverAlone: boolean): number {
  if (pageCount <= 0) return 0;
  return coverAlone ? 1 + Math.ceil((pageCount - 1) / 2) : Math.ceil(pageCount / 2);
}

/** Index of the block holding `page`. */
export function blockIndexOf(page: number, coverAlone: boolean): number {
  if (coverAlone) return page <= 0 ? 0 : Math.ceil(page / 2);
  return Math.floor(page / 2);
}

/** The pages (one or two, in index order) of block `block`; empty when the block doesn't exist. */
export function blockPages(block: number, pageCount: number, coverAlone: boolean): number[] {
  if (block < 0) return [];
  const start = coverAlone ? (block === 0 ? 0 : 2 * block - 1) : 2 * block;
  const end = coverAlone && block === 0 ? start : start + 1;
  const pages: number[] = [];
  for (let page = start; page <= end && page < pageCount; page++) pages.push(page);
  return pages;
}

/**
 * The pages of the spread holding `page`: its whole block, unless the block has two pages and one of
 * them is landscape, in which case each page is a spread of its own.
 */
export function spreadOf(page: number, pageCount: number, coverAlone: boolean, isLandscape: IsLandscape): number[] {
  const pages = blockPages(blockIndexOf(page, coverAlone), pageCount, coverAlone);
  return pages.length === 2 && pages.some(isLandscape) ? [page] : pages;
}

/** Every spread of the book, in reading order, given the orientation of each page. */
export function spreadsOf(pageCount: number, coverAlone: boolean, isLandscape: IsLandscape): number[][] {
  const spreads: number[][] = [];
  for (let block = 0; block < blockCount(pageCount, coverAlone); block++) {
    const pages = blockPages(block, pageCount, coverAlone);
    if (pages.length === 2 && pages.some(isLandscape)) spreads.push(...pages.map((page) => [page]));
    else spreads.push(pages);
  }
  return spreads;
}

/** The page saved as the reading progress of a spread: its highest index. */
export function highestPage(spread: readonly number[]): number {
  return spread[spread.length - 1];
}

/** The page the next spread starts at, or `null` when the spread ends the book. */
export function pageAfter(spread: readonly number[], pageCount: number): number | null {
  const next = highestPage(spread) + 1;
  return next < pageCount ? next : null;
}

/** The last page of the spread before this one, or `null` when the spread starts the book. */
export function pageBefore(spread: readonly number[]): number | null {
  return spread[0] > 0 ? spread[0] - 1 : null;
}

/** Whether the spread starts the book and whether it ends it. */
export function spreadEnds(spread: readonly number[], pageCount: number): { isFirst: boolean; isLast: boolean } {
  return { isFirst: spread[0] === 0, isLast: highestPage(spread) === pageCount - 1 };
}

/** The pages as the header's counter writes them: `4` for one page, `4–5` for two. */
export function pagesLabel(pages: readonly number[]): string {
  return pages.length > 1 ? `${pages[0] + 1}–${highestPage(pages) + 1}` : String(pages[0] + 1);
}

/**
 * Which side each page of `spread` is drawn on, left to right. A pair puts the lower index on the
 * left (right-to-left reading: on the right). A landscape page takes the whole width. Any other lone
 * page keeps the spine at the centre and sits on the half it has in its pair: the cover on the right
 * (left in right-to-left reading), the last odd page on the opposite half.
 */
export function spreadPlacements(
  spread: readonly number[],
  coverAlone: boolean,
  direction: AppSettings['readingDirection'],
  isLandscape: IsLandscape,
): SpreadPlacement[] {
  if (spread.length === 2) {
    const [first, second] = spread;
    return direction === 'rtl'
      ? [
          { page: second, side: 'left' },
          { page: first, side: 'right' },
        ]
      : [
          { page: first, side: 'left' },
          { page: second, side: 'right' },
        ];
  }
  const page = spread[0];
  if (isLandscape(page)) return [{ page, side: 'center' }];
  // With the cover alone, the pairs are [1, 2], [3, 4]…: the cover takes the slot of a page -1, that is
  // the second slot of its own pair, which is the right half in left-to-right reading.
  const isSecondOfPair = (page + (coverAlone ? 1 : 0)) % 2 === 1;
  const onRight = direction === 'rtl' ? !isSecondOfPair : isSecondOfPair;
  return [{ page, side: onRight ? 'right' : 'left' }];
}

/**
 * The cells of a spread from left to right, each at its natural size (`sizeOf`): a lone page on a half
 * has an empty cell of its own size on the other half, so the spine stays at the centre.
 */
export function spreadCells(placements: readonly SpreadPlacement[], sizeOf: (page: number) => Size): SpreadCell[] {
  if (placements.length === 2) return placements.map(({ page }) => ({ page, ...sizeOf(page) }));
  const { page, side } = placements[0];
  const size = sizeOf(page);
  if (side === 'center') return [{ page, ...size }];
  const empty: SpreadCell = { page: null, ...size };
  return side === 'left' ? [{ page, ...size }, empty] : [empty, { page, ...size }];
}

/** The natural size of a laid-out spread: the cells side by side, as tall as the tallest. */
export function cellsSize(cells: readonly SpreadCell[]): Size {
  return {
    width: cells.reduce((sum, cell) => sum + cell.width, 0),
    height: cells.reduce((tallest, cell) => Math.max(tallest, cell.height), 0),
  };
}
