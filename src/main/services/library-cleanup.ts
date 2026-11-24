/**
 * Cleaning the books: removing from their archives the files that are not images. Two steps so the
 * user decides with the facts in hand: `analyze()` lists what would go (nothing is touched) and
 * `apply()` rewrites the archives, minus the kinds of files the user chose to keep. Only CBZ can be
 * rewritten. Either step can be stopped (`cancel()`) between two books, never inside one: a book
 * being rewritten is finished, so its archive is never left half-replaced. Kept out of the IPC layer,
 * which only calls it, so it runs under Vitest.
 * @module
 */
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { t } from '../../shared/i18n';
import {
  MAX_REPORTED_FAILURES,
  type CleanupAnalysisResult,
  type CleanupGroup,
  type CleanupGroupBook,
  type CleanupResult,
  type ScanFailure,
  type ScanProgress,
} from '../../shared/library';
import type { LibraryRepository } from '../db/library-repository';
import type { CleanedArchive, JunkEntry } from './cbz-cleaner';
import { isOnlineOnly } from './cloud-files';
import type { LibraryNotifier, LibraryRunLock } from './library-organization';

/** The part of the decoder process the cleanup calls. */
export interface CleanupDecoder {
  /** The non-image files of a CBZ, null for another format. */
  listJunk(filePath: string): Promise<JunkEntry[] | null>;
  /** Rewrites a CBZ without the entries named. */
  cleanArchive(filePath: string, names: string[]): Promise<CleanedArchive>;
}

/** The cleanup as the handlers use it; built once in `main.ts`. */
export interface LibraryCleaner {
  /**
   * Lists the non-image files of the books `ids` (the whole library when empty), grouped by
   * extension, and remembers the result under the returned token. Reports progress book by book.
   * Stopped by `cancel()`, it resolves with `cancelled` and keeps no plan.
   */
  analyze(ids: string[], onProgress: (progress: ScanProgress) => void): Promise<CleanupAnalysisResult>;
  /**
   * Removes the files of the analysis `token` from the archives, except the kinds whose extension is
   * in `keptExtensions`. The token works once. Stopped by `cancel()`, it resolves with `cancelled`:
   * the books already rewritten stay so (and are counted, updated and notified), the others are untouched.
   */
  apply(token: string, keptExtensions: string[], onProgress: (progress: ScanProgress) => void): Promise<CleanupResult>;
  /**
   * Stops the analysis or the rewrite in progress before its next book (the book being read or
   * rewritten is finished); false when neither is running. The rewrite holds the shared lock, so
   * `LibraryRunLock.cancel()` stops it too; the analysis, which only reads, doesn't take the lock.
   */
  cancel(): boolean;
}

/** Analyses kept for `apply()`; the oldest is forgotten past this. */
const MAX_ANALYSES = 5;
/** File names quoted per group in the summary. */
const MAX_EXAMPLES = 3;
/** Books listed per group in the unfolded detail; the group's `books` still counts them all. */
export const MAX_DETAIL_BOOKS = 100;

/** A book of an analysis: what the cleanup would remove from it. */
export interface PlannedBook {
  id: string;
  path: string;
  /** The non-image files of the archive. */
  junk: JunkEntry[];
}

/** The lower-cased extension of an archive entry with its dot (`.xml`), empty when it has none (a leading dot, as in `.DS_Store`, makes a hidden file, not an extension). */
export function junkExtension(entryName: string): string {
  const base = path.posix.basename(entryName);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

/** Groups the junk of the books by extension, the heaviest kind first. */
export function groupJunk(books: readonly PlannedBook[]): CleanupGroup[] {
  const groups = new Map<string, CleanupGroup>();
  for (const book of books) {
    // The detail line of this book in each group it appears in (undefined once the group's list is full).
    const lines = new Map<string, CleanupGroupBook | undefined>();
    for (const file of book.junk) {
      const extension = junkExtension(file.name);
      let group = groups.get(extension);
      if (!group) {
        group = { extension, files: 0, books: 0, size: 0, examples: [], details: [] };
        groups.set(extension, group);
      }
      group.files++;
      group.size += file.size;
      if (!lines.has(extension)) {
        group.books++;
        const line = group.details.length < MAX_DETAIL_BOOKS ? { name: path.basename(book.path), files: [] } : undefined;
        if (line) group.details.push(line);
        lines.set(extension, line);
      }
      lines.get(extension)?.files.push(file.name);
      const base = path.posix.basename(file.name);
      if (group.examples.length < MAX_EXAMPLES && !group.examples.includes(base)) group.examples.push(base);
    }
  }
  return [...groups.values()].sort((a, b) => b.size - a.size || a.extension.localeCompare(b.extension));
}

/** Notes why the book at `filePath` failed, up to `MAX_REPORTED_FAILURES` books. */
function reportFailure(failures: ScanFailure[], filePath: string, error: unknown): void {
  if (failures.length < MAX_REPORTED_FAILURES) {
    failures.push({ path: filePath, reason: error instanceof Error ? error.message : String(error) });
  }
}

/** Builds the cleaner around the library and the decoder; `notify` announces the rewritten entries. */
export function createLibraryCleaner(
  repo: LibraryRepository,
  decoder: CleanupDecoder,
  notify: LibraryNotifier,
  // Shared with the resynchronizer and the organizer: a book is not rewritten while a run moves or registers files.
  lock?: LibraryRunLock,
): LibraryCleaner {
  const analyses = new Map<string, PlannedBook[]>();
  let running = false;
  // The stop of the step in progress, null between runs.
  let controller: AbortController | null = null;

  const progress = (onProgress: (progress: ScanProgress) => void, phase: ScanProgress['phase'], processed: number, total: number, currentFile: string) =>
    onProgress({ phase, processed, total, currentFile });

  return {
    async analyze(ids, onProgress) {
      if (running) return { status: 'error', message: t('errors:library.cleanupRunning') };
      running = true;
      const { signal } = (controller = new AbortController());
      try {
        const wanted = new Set(ids);
        const entries = repo.list().filter((entry) => wanted.size === 0 || wanted.has(entry.id));
        const books: PlannedBook[] = [];
        let skipped = 0;
        let failed = 0;
        const failures: ScanFailure[] = [];
        for (const [index, entry] of entries.entries()) {
          if (signal.aborted) {
            // A partial plan is not offered: the books not analyzed would silently stay as they are.
            progress(onProgress, 'done', index, entries.length, '');
            return { status: 'cancelled' };
          }
          progress(onProgress, 'importing', index, entries.length, entry.path);
          // Reading a cloud placeholder would download it.
          if (await isOnlineOnly(entry.path)) {
            skipped++;
            continue;
          }
          try {
            const junk = await decoder.listJunk(entry.path);
            if (junk === null) skipped++;
            else if (junk.length > 0) books.push({ id: entry.id, path: entry.path, junk });
          } catch (error) {
            failed++;
            reportFailure(failures, entry.path, error);
          }
        }
        progress(onProgress, 'done', entries.length, entries.length, '');

        const token = randomUUID();
        analyses.set(token, books);
        for (const old of [...analyses.keys()].slice(0, Math.max(0, analyses.size - MAX_ANALYSES))) analyses.delete(old);
        return {
          status: 'ok',
          token,
          groups: groupJunk(books),
          scanned: entries.length - skipped - failed,
          booksWithJunk: books.length,
          skipped,
          failed,
          failures,
        };
      } finally {
        running = false;
        controller = null;
      }
    },

    async apply(token, keptExtensions, onProgress) {
      const books = analyses.get(token);
      if (!books) return { status: 'error', message: t('errors:library.cleanupExpired') };
      if (running) return { status: 'error', message: t('errors:library.cleanupRunning') };
      const lockSignal = lock?.tryStart('cleanup');
      if (lock && !lockSignal) return { status: 'error', message: lock.busyMessage() };
      analyses.delete(token);
      running = true;
      const own = (controller = new AbortController());
      const { signal } = own;
      // `lock.cancel()` (`library:cancel-run`) stops the rewrite as `cancel()` does.
      const stop = () => own.abort();
      lockSignal?.addEventListener('abort', stop, { once: true });
      try {
        const kept = new Set(keptExtensions);
        const result = { cleaned: 0, filesRemoved: 0, bytesFreed: 0, failed: 0 };
        const failures: ScanFailure[] = [];
        const upserted = [];
        let processed = books.length;
        for (const [index, book] of books.entries()) {
          // Checked between two books only: `cleanArchive` replaces the original once the new archive is checked.
          if (signal.aborted) {
            processed = index;
            break;
          }
          const names = book.junk.filter((file) => !kept.has(junkExtension(file.name))).map((file) => file.name);
          progress(onProgress, 'importing', index, books.length, book.path);
          if (names.length === 0) continue;
          try {
            const before = (await stat(book.path)).size;
            const { fileCount } = await decoder.cleanArchive(book.path, names);
            const after = (await stat(book.path)).size;
            const entry = repo.updateFileStats(book.id, fileCount, after);
            if (entry) upserted.push(entry);
            result.cleaned++;
            result.filesRemoved += names.length;
            result.bytesFreed += Math.max(0, before - after);
          } catch (error) {
            result.failed++;
            reportFailure(failures, book.path, error);
          }
        }
        progress(onProgress, 'done', processed, books.length, '');
        if (upserted.length > 0) notify({ scope: 'library', upserted });
        // A stop asked during the last book came too late to leave anything out.
        return { status: 'ok', ...result, failures, cancelled: processed < books.length };
      } finally {
        running = false;
        controller = null;
        lockSignal?.removeEventListener('abort', stop);
        lock?.end();
      }
    },

    cancel() {
      if (!controller || controller.signal.aborted) return false;
      controller.abort();
      return true;
    },
  };
}
