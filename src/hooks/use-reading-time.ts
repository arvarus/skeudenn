/**
 * Measures the time spent reading a book, for the statistics page.
 * @module
 */
import { useEffect } from 'react';

import { createReadingTimeAccumulator } from '@/lib/reading-time';

/** How often the reader checks whether the book is being read, in seconds. */
const TICK_SECONDS = 5;

/**
 * Counts the time during which the book `libraryId` is open in a visible, focused window, and
 * reports it to the main process every minute or so and when the reader closes. Does nothing for
 * `null` (no book open, or a book read anonymously, which leaves no trace).
 */
export function useReadingTime(libraryId: string | null): void {
  useEffect(() => {
    if (!libraryId) return;
    const accumulator = createReadingTimeAccumulator((seconds) => {
      void window.skeudenn.stats.addReadingTime(libraryId, seconds).catch(() => undefined);
    });
    const interval = window.setInterval(() => {
      accumulator.tick(document.visibilityState === 'visible' && document.hasFocus(), TICK_SECONDS);
    }, TICK_SECONDS * 1000);
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') accumulator.flush();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      accumulator.flush();
    };
  }, [libraryId]);
}
