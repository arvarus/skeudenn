/**
 * Page-turning controls shared by the page-by-page and the book readers.
 * @module
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { pageTurnForKey, scrollEdgeAfterMove, type ReaderPosition } from '@/lib/reader-navigation';
import { createWheelPager } from '@/lib/wheel-pager';
import type { AppSettings } from '@/shared/settings';

/** What {@link useReaderControls} needs from the reader that uses it. */
export interface ReaderControlsOptions {
  /** The scrolling area of the page(s): where the wheel is listened to and the edge is scrolled to. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Moves toward the end of the reading order (right control in LTR, left one in RTL). */
  advance: () => void;
  /** Moves back toward the start. */
  retreat: () => void;
  /** Whether scrolling down advances (`standard`) or retreats (`inverted`). */
  scrollDirection: AppSettings['scrollDirection'];
  /**
   * Whether the content is zoomed (it may scroll): the wheel then only turns the page once it can't
   * scroll further in its direction. Unzoomed, every wheel gesture turns the page.
   */
  zoomed: boolean;
  /** Where the reader is: the book (its archive id) and a page of it; a change of it is a page turn. */
  position: ReaderPosition;
  /**
   * Truthy once the content of the new position is laid out (an image's size is known): that is
   * when the edge a turn lands on can be scrolled to. A new value is a new content.
   */
  ready: unknown;
}

/**
 * The wheel, the turning keys and the scroll edge after a page turn, which the page-by-page reader
 * and the book reader share.
 *
 * - **Wheel**: while zoomed in, a scroll that can still pan the content is left alone; only once the
 *   pan hits the edge (or unzoomed, where there is no pan at all) does the wheel turn the page.
 *   `createWheelPager` keeps one trackpad swipe (many wheel events, plus the OS's inertia tail) to
 *   exactly one page turn. The pager lives in state, not in an effect, so nothing can reset it in
 *   the middle of a gesture. The wheel and key listeners are attached once and call the latest
 *   `advance`/`retreat` through a ref refreshed by a layout effect: re-attaching them from a passive
 *   effect on each render left a window after the commit in which an event met the previous render's
 *   (stale) `advance` and the turn was lost.
 * - **Keys**: `pageTurnForKey()`.
 * - **Scroll edge**: after a turn, zoomed content starts at its top (forward) or bottom (backward)
 *   edge instead of keeping the previous page's scroll position; another book opens at the top (the
 *   reader isn't remounted per book, so the scroll stays). The new content only has its size once
 *   decoded, so the edge is remembered when the position changes and applied once `ready` is truthy.
 */
export function useReaderControls({
  containerRef,
  advance,
  retreat,
  scrollDirection,
  zoomed,
  position,
  ready,
}: ReaderControlsOptions): void {
  const { bookId, page } = position;
  const lastPosition = useRef<ReaderPosition>({ bookId, page });
  const pendingEdge = useRef<'top' | 'bottom' | null>(null);
  // Layout effects, in this order: when the position and the readiness change in the same commit (the
  // content was already decoded), the edge is noted before it is applied.
  useLayoutEffect(() => {
    const current = { bookId, page };
    const edge = scrollEdgeAfterMove(lastPosition.current, current);
    if (edge) {
      pendingEdge.current = edge;
      lastPosition.current = current;
    }
  }, [bookId, page]);
  useLayoutEffect(() => {
    const el = containerRef.current;
    const edge = pendingEdge.current;
    if (!el || !ready || !edge) return;
    pendingEdge.current = null;
    el.scrollTo({ top: edge === 'top' ? 0 : el.scrollHeight, left: 0 });
  }, [containerRef, ready]);

  const [pager] = useState(createWheelPager);
  // The listeners below are attached once and read the latest options through this ref, which a layout
  // effect refreshes in the very commit that changes them. Re-attaching them from a passive effect
  // instead left a window between the commit (the new spread is on screen) and the effect's flush,
  // where a wheel or a key reached the previous render's listener: its `advance` was closed over the
  // previous spread (none, while the pages loaded), so the turn was silently lost.
  const latest = useRef({ advance, retreat, scrollDirection, zoomed });
  useLayoutEffect(() => {
    latest.current = { advance, retreat, scrollDirection, zoomed };
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      const { advance, retreat, scrollDirection, zoomed } = latest.current;
      const inverted = scrollDirection === 'inverted';
      // Fed even for events that only pan, so a swipe that pans up to the edge doesn't
      // then turn the page with its own inertia: that takes a new gesture.
      const step = pager(event.deltaY, event.timeStamp);

      if (zoomed) {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) {
          return;
        }
      }

      event.preventDefault();
      if (step === 0) return;

      const goForward = inverted ? step < 0 : step > 0;
      if (goForward) advance();
      else retreat();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef, pager]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const turn = pageTurnForKey(event);
      if (turn === null) return;
      event.preventDefault();
      if (turn === 'advance') latest.current.advance();
      else latest.current.retreat();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
