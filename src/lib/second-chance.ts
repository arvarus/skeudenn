/**
 * The home page's "second chance" block: the library's worst-rated books, offered again.
 * @module
 */
import { sampleRandom } from '@/lib/home-picks';
import type { LibraryEntry } from '@/shared/library';

/** The highest rating (out of 5) that still counts as a poor one. */
export const LOW_RATING_MAX = 2;

/** How many books the block shows. */
export const SECOND_CHANCE_LIMIT = 5;

/** Whether `entry` is poorly rated: rated, and at most {@link LOW_RATING_MAX}. Unrated books (rating 0) are not. */
export function isLowRated(entry: LibraryEntry): boolean {
  return entry.rating >= 1 && entry.rating <= LOW_RATING_MAX;
}

/**
 * The rated books at or below {@link LOW_RATING_MAX}, worst first (ties by title, numeric and
 * accent-insensitive), at most `limit`. Unrated books (rating 0) are not poorly rated.
 */
export function lowestRated(entries: readonly LibraryEntry[], limit: number = SECOND_CHANCE_LIMIT): LibraryEntry[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return entries
    .filter(isLowRated)
    .sort((a, b) => a.rating - b.rating || collator.compare(a.title, b.title))
    .slice(0, limit);
}

/**
 * A random selection of poorly rated books: `count` books drawn among all those rated
 * {@link LOW_RATING_MAX} or less, worst first.
 */
export function pickRandomLowRated(
  entries: readonly LibraryEntry[],
  count: number = SECOND_CHANCE_LIMIT,
  random: () => number = Math.random,
): LibraryEntry[] {
  const pool = lowestRated(entries, Infinity);
  return sampleRandom(pool, count, random).sort((a, b) => a.rating - b.rating || a.title.localeCompare(b.title));
}
