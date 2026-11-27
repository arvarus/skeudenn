/**
 * Pure reading-list logic for the renderer: which books count as finished, the list's progress,
 * the next book to read, the reordering rules (finished books stay where they are; the lists
 * themselves move freely), the drag and drop of a library book onto a list, and adding several
 * books at once (a whole series, or the library page's selection).
 * @module
 */
import { currentLanguage, t } from '@/shared/i18n';
import { READ_TAG, type LibraryEntry } from '@/shared/library';
import {
  MAX_READING_LIST_SIZE,
  type ReadingList,
  type ReadingListAddResult,
  type ReadingListResult,
} from '@/shared/reading-list';

/** The library page's other quick tag, stored untranslated like {@link READ_TAG}. */
export const TO_READ_TAG = 'À lire';

/** The tags always offered as one-click toggles on a book row and in the library's tag filter; any other tag is free-form. */
export const QUICK_TAGS: readonly string[] = [READ_TAG, TO_READ_TAG];

/** `tags` with `tag` added at the end, or taken out when already there: what a click on a tag toggle stores. */
export function toggleTag(tags: readonly string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
}

/**
 * How a tag is shown: the quick tags ({@link READ_TAG}, {@link TO_READ_TAG}) get their label in
 * the current language, any other tag is the user's own text.
 */
export function tagLabel(tag: string): string {
  if (tag === READ_TAG) return t('library:tags.read');
  if (tag === TO_READ_TAG) return t('library:tags.toRead');
  return tag;
}

/** Whether a book counts as finished: its last page was reached, or it carries the `Lu` tag. */
export function isFinished(entry: LibraryEntry): boolean {
  return entry.tags.includes(READ_TAG) || (entry.pageCount > 0 && entry.currentPage >= entry.pageCount - 1);
}

/** The list's books, in reading order; ids no longer in the library are skipped. */
export function listEntries(list: ReadingList, library: LibraryEntry[]): LibraryEntry[] {
  const byId = new Map(library.map((entry) => [entry.id, entry]));
  return list.entryIds.flatMap((id) => byId.get(id) ?? []);
}

/** How far along a list is: finished books out of all its books, and that as a 0–100 percentage. */
export interface ListProgress {
  finished: number;
  total: number;
  /** 0 for an empty list. */
  percent: number;
}

/** Progress of a list given its books (see `listEntries()`). */
export function listProgress(entries: LibraryEntry[]): ListProgress {
  const finished = entries.filter(isFinished).length;
  const total = entries.length;
  return { finished, total, percent: total === 0 ? 0 : (finished / total) * 100 };
}

/**
 * The book to read next: the first unfinished one, in list order. `excludeId` skips a book, the
 * one just finished in the reader, whose progress may not be saved yet. Null when all are read.
 */
export function nextToRead(entries: LibraryEntry[], excludeId?: string): LibraryEntry | null {
  return entries.find((entry) => entry.id !== excludeId && !isFinished(entry)) ?? null;
}

/**
 * Moves the book at index `from` to index `to` in `order`, a list's entry ids. Finished books
 * are pinned: they can't be moved, and the others move around them (only the unfinished books
 * swap places; each finished book keeps its index). Returns null when the move is refused, i.e.
 * when `from` or `to` is a finished book, out of range, or the same index.
 */
export function moveUnfinished(order: string[], finished: ReadonlySet<string>, from: number, to: number): string[] | null {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return null;
  if (finished.has(order[from]) || finished.has(order[to])) return null;

  const slots = order.flatMap((id, index) => (finished.has(id) ? [] : [index]));
  const unfinished = slots.map((index) => order[index]);
  const [moved] = unfinished.splice(slots.indexOf(from), 1);
  unfinished.splice(slots.indexOf(to), 0, moved);

  const result = [...order];
  slots.forEach((index, rank) => {
    result[index] = unfinished[rank];
  });
  return result;
}

/**
 * Moves the item at index `from` to index `to`, shifting the ones in between (how the sidebar
 * reorders the lists themselves, by drag and drop). Returns null when the move is a no-op or out
 * of range.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] | null {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return null;
  const result = [...items];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}

/**
 * The drag-and-drop data type of a library book dragged from the library page onto a reading
 * list of the sidebar. A custom type, so the sidebar tells a book from one of its own lists being
 * reordered, and from files dragged in from outside the app.
 */
export const LIBRARY_ENTRY_DRAG_TYPE = 'application/x-skeudenn-entry';

/** What each dragged library book carries: its id, and its title for the confirmation message. */
export interface DraggedEntry {
  id: string;
  title: string;
}

/**
 * Encodes the dragged books (one, or the library page's selection) for `DataTransfer.setData()`
 * under {@link LIBRARY_ENTRY_DRAG_TYPE}.
 */
export function encodeDraggedEntries(entries: readonly DraggedEntry[]): string {
  return JSON.stringify(entries.map((entry) => ({ id: entry.id, title: entry.title })));
}

/**
 * Decodes what {@link encodeDraggedEntries} wrote; null for anything else, or for no book (the
 * data comes from a drag, which another app could have started with the same type).
 */
export function decodeDraggedEntries(data: string): DraggedEntry[] | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const entries: DraggedEntry[] = [];
    for (const item of parsed as unknown[]) {
      if (typeof item !== 'object' || item === null) return null;
      const { id, title } = item as Record<string, unknown>;
      if (typeof id !== 'string' || id === '' || typeof title !== 'string') return null;
      entries.push({ id, title });
    }
    return entries;
  } catch {
    return null;
  }
}

/** The message shown after a book was dropped on a list, and whether it is an error. */
export interface DropFeedback {
  message: string;
  error: boolean;
}

/**
 * The message for a book dropped on `list` (as it was before the drop), given what
 * `readingLists.addEntry()` answered: added, already there (the repository accepts it as a no-op),
 * or refused with its own message (full list, book gone).
 */
export function dropFeedback(list: ReadingList, entry: DraggedEntry, result: ReadingListResult): DropFeedback {
  if (result.status === 'error') return { message: result.message, error: true };
  if (list.entryIds.includes(entry.id)) {
    return { message: t('lists:dropAlreadyIn', { title: entry.title, list: list.name }), error: false };
  }
  return { message: t('lists:dropAdded', { title: entry.title, list: list.name }), error: false };
}

/** How a series name is compared: trimmed, case and accents ignored ("Astérix" = "asterix "). */
export function seriesKey(series: string): string {
  return series.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}

/**
 * Every library book of `entry`'s series, by volume (natural order: "2" before "10", books
 * without a volume last), then title. Series names match ignoring case and accents. Just
 * `[entry]` when it has no series.
 */
export function seriesEntries(entry: LibraryEntry, library: LibraryEntry[]): LibraryEntry[] {
  if (!entry.series?.trim()) return [entry];
  const key = seriesKey(entry.series);
  return sortByVolume(library.filter((other) => other.series != null && seriesKey(other.series) === key));
}

/** Sorts `books` of one series in place by volume (natural order, no volume last), then title. */
export function sortByVolume(books: LibraryEntry[]): LibraryEntry[] {
  const collator = new Intl.Collator(currentLanguage(), { numeric: true, sensitivity: 'base' });
  return books.sort((a, b) => {
    if (a.volume === null || b.volume === null) {
      if (a.volume !== b.volume) return a.volume === null ? 1 : -1;
    } else {
      const byVolume = collator.compare(a.volume, b.volume);
      if (byVolume !== 0) return byVolume;
    }
    return collator.compare(a.title, b.title);
  });
}

/**
 * What to send to `readingLists.addEntries()` to put `ids` in `list`: the books not already in
 * it (as the renderer knows it), cut to the room left under {@link MAX_READING_LIST_SIZE}, so a
 * selection of thousands of books stays a short call. The books already in the list and those
 * cut off are counted here, to be merged with the call's answer by {@link bulkAddFeedback}.
 */
export interface BulkAddRequest {
  ids: string[];
  alreadyIn: number;
  overLimit: number;
}

/** Prepares adding `ids` to `list`, in that order (duplicates count once); see {@link BulkAddRequest}. */
export function bulkAddRequest(list: ReadingList, ids: readonly string[]): BulkAddRequest {
  const present = new Set(list.entryIds);
  const unique = [...new Set(ids)];
  const fresh = unique.filter((id) => !present.has(id));
  const room = Math.max(0, MAX_READING_LIST_SIZE - list.entryIds.length);
  return { ids: fresh.slice(0, room), alreadyIn: unique.length - fresh.length, overLimit: Math.max(0, fresh.length - room) };
}

/**
 * The message after adding several books to `list` at once: how many were added, then, when
 * some weren't, how many were already in it and how many didn't fit (the list being full).
 * `result` is `readingLists.addEntries()`'s answer, or null when there was nothing to send.
 */
export function bulkAddFeedback(list: ReadingList, request: BulkAddRequest, result: ReadingListAddResult | null): DropFeedback {
  if (result?.status === 'error') return { message: result.message, error: true };
  const added = result?.added ?? 0;
  const alreadyIn = request.alreadyIn + (result?.alreadyIn ?? 0);
  const overLimit = request.overLimit + (result?.overLimit ?? 0);
  const parts = [t('lists:bulkAdded', { count: added, list: list.name })];
  if (alreadyIn > 0) parts.push(t('lists:bulkAlreadyIn', { count: alreadyIn }));
  if (overLimit > 0) parts.push(t('lists:bulkOverLimit', { count: overLimit, max: MAX_READING_LIST_SIZE }));
  if (result && result.missing > 0) parts.push(t('lists:bulkMissing', { count: result.missing }));
  return { message: parts.join(' · '), error: added === 0 && overLimit > 0 };
}
