/**
 * Page-turning rules of the single-page reader, kept pure so the left-to-right / right-to-left
 * swap can be tested.
 * @module
 */
import type { AppSettings } from '@/shared/settings';

/** The reader's physical controls (arrow keys, click zones, wheel), resolved to page steps. */
export interface DirectionalControls<T> {
  /** Moves toward the end of the reading order: the right control in LTR, the left one in RTL. */
  advance: T;
  /** Moves back toward the start: the opposite of `advance`. */
  retreat: T;
}

/**
 * Binds `advance` and `retreat` to the actions that move one page `forward` (index + 1) or
 * `backward` (index - 1), swapping them in right-to-left (manga) reading order.
 */
export function directionalControls<T>(
  direction: AppSettings['readingDirection'],
  forward: T,
  backward: T,
): DirectionalControls<T> {
  return direction === 'rtl' ? { advance: backward, retreat: forward } : { advance: forward, retreat: backward };
}

/**
 * Whether the physical left (`isPrevDisabled`) and right (`isNextDisabled`) click zones have
 * nowhere to go: the first and last page swap sides in right-to-left order.
 */
export function disabledControls(
  direction: AppSettings['readingDirection'],
  page: number,
  pageCount: number,
): { isPrevDisabled: boolean; isNextDisabled: boolean } {
  const isFirst = page === 0;
  const isLast = page === pageCount - 1;
  return direction === 'rtl'
    ? { isPrevDisabled: isLast, isNextDisabled: isFirst }
    : { isPrevDisabled: isFirst, isNextDisabled: isLast };
}

/**
 * The edge of a zoomed page the view lands on after a page turn: the top when moving toward
 * the end of the book (index goes up), the bottom when going back, so the reader continues
 * from where they were instead of keeping the previous page's scroll position.
 */
export function scrollEdgeAfterTurn(previousPage: number, page: number): 'top' | 'bottom' {
  return page < previousPage ? 'bottom' : 'top';
}

/** Where the single-page reader is: which opened book (its archive id) and which page of it. */
export interface ReaderPosition {
  /** The opened archive's id (`ComicInfo.id`): a new one for every book opened. */
  bookId: string;
  /** Index of the page shown. */
  page: number;
}

/**
 * The edge of a zoomed page the view lands on when the reader moves from `previous` to `current`,
 * or `null` when it didn't move. Within a book this is {@link scrollEdgeAfterTurn}; another book
 * always opens at the top of its page, whatever page the previous one was at, since comparing the
 * pages of two different books says nothing about the reading direction.
 */
export function scrollEdgeAfterMove(previous: ReaderPosition, current: ReaderPosition): 'top' | 'bottom' | null {
  if (previous.bookId !== current.bookId) return 'top';
  if (previous.page === current.page) return null;
  return scrollEdgeAfterTurn(previous.page, current.page);
}

/** What `pageTurnForKey()` reads of a `keydown` event (a `KeyboardEvent` fits). */
export interface PageTurnKeyEvent {
  key: string;
  defaultPrevented: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
}

/**
 * Which page turn a key press asks for, or `null` when it is not the reader's: a key already handled
 * elsewhere, one pressed with Ctrl/Alt/Meta (`Alt+←` is "back", not "previous page"), one typed in a
 * field or a list (arrows pick an option there), and Space on a button or a link, where it activates
 * the control.
 */
export function pageTurnForKey(event: PageTurnKeyEvent): 'advance' | 'retreat' | null {
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return null;
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = target?.tagName?.toUpperCase();
  if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
  switch (event.key) {
    case 'ArrowRight':
    case 'PageDown':
      return 'advance';
    case ' ':
      return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' ? null : 'advance';
    case 'ArrowLeft':
    case 'PageUp':
      return 'retreat';
    default:
      return null;
  }
}
