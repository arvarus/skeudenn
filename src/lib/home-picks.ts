/**
 * Pure logic of the home page's suggestions: a random selection among the books not read yet.
 * @module
 */
import { isFinished, seriesKey, sortByVolume } from '@/lib/reading-list';
import type { LibraryEntry } from '@/shared/library';

/** How many books the home page suggests. */
export const HOME_PICK_COUNT = 5;

/**
 * The unread books worth suggesting: books without a series, and for each series only its first
 * unread book in volume order, so volume 1 is proposed unless the previous volumes are already
 * read (then the next one is).
 */
function suggestable(library: readonly LibraryEntry[]): LibraryEntry[] {
  const pool: LibraryEntry[] = [];
  const series = new Map<string, LibraryEntry[]>();
  for (const entry of library) {
    if (!entry.series?.trim()) {
      if (!isFinished(entry)) pool.push(entry);
      continue;
    }
    const key = seriesKey(entry.series);
    const books = series.get(key);
    if (books) books.push(entry);
    else series.set(key, [entry]);
  }
  for (const books of series.values()) {
    const next = sortByVolume(books).find((book) => !isFinished(book));
    if (next) pool.push(next);
  }
  return pool;
}

/**
 * Up to `count` distinct books drawn at random among those not finished yet (see `isFinished()`;
 * a book already started still counts as unread), keeping only the next unread volume of each
 * series. Fewer are returned when the library holds
 * fewer. `random` is injectable for tests and returns a number in [0, 1) like `Math.random`.
 */
export function pickRandomUnread(
  library: readonly LibraryEntry[],
  count: number = HOME_PICK_COUNT,
  random: () => number = Math.random,
): LibraryEntry[] {
  return sampleRandom(suggestable(library), count, random);
}

/**
 * Up to `count` distinct items drawn at random from `pool` (which is reordered). `random` is
 * injectable for tests and returns a number in [0, 1) like `Math.random`.
 */
export function sampleRandom<T>(pool: T[], count: number, random: () => number = Math.random): T[] {
  // Partial Fisher-Yates: only the first `count` slots need shuffling.
  const picks = Math.min(count, pool.length);
  for (let i = 0; i < picks; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, picks);
}

/**
 * The books of a draw kept by id (a home block's selection), taken from the current `library` so
 * each shows its latest state (progress, rating, tags), in the order of `ids`. A book no longer in
 * the library is left out, and so is one that `keep` refuses: the block's own condition applied
 * again (a book whose rating was raised leaves the poorly rated ones).
 */
export function resolveDrawn(
  library: readonly LibraryEntry[],
  ids: readonly string[],
  keep: (entry: LibraryEntry) => boolean = () => true,
): LibraryEntry[] {
  const byId = new Map(library.map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => {
    const entry = byId.get(id);
    return entry && keep(entry) ? [entry] : [];
  });
}
