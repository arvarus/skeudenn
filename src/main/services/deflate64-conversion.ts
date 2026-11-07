/**
 * Rewriting the CBZ that use the Deflate64 compression. The decoder can't inflate those entries, so such
 * a book opens but shows unreadable pages; each is rewritten in place with standard compression (the
 * path, hence the entry and everything personal keyed on it, is unchanged). Applies to the whole
 * library, not only the organized folder: no file is moved or created beside the book. Kept out of the
 * IPC layer, which only calls it, so it runs under Vitest.
 * @module
 */
import { stat } from 'node:fs/promises';

import { comicFormat } from '../../shared/comic';
import type { ConvertDeflate64Result, Deflate64CountResult, ScanProgress } from '../../shared/library';
import type { LibraryRepository } from '../db/library-repository';
import type { Deflate64Converted } from './cbz-deflate64';
import { isOnlineOnly } from './cloud-files';
import type { LibraryNotifier, LibraryRunLock } from './library-organization';

/** The part of the decoder process the conversion calls. */
export interface Deflate64Decoder {
  /** Whether a CBZ has Deflate64 entries. */
  hasDeflate64(filePath: string): Promise<boolean>;
  /** Rewrites a CBZ with standard compression. */
  convertDeflate64(filePath: string): Promise<Deflate64Converted>;
  /** Deletes a book's cached thumbnail. */
  removeThumbnail(filePath: string): Promise<void>;
}

/** The conversion as the handlers use it; built once in `main.ts`. */
export interface Deflate64Converter {
  /**
   * How many CBZ of the library use Deflate64. Opens each archive's directory only, reporting each through
   * `onProgress`; a book that can't be read is not counted. Holds the shared lock, and keeps what it found for
   * the next `convert()`, so the library isn't checked twice.
   */
  count(onProgress?: (progress: ScanProgress) => void): Promise<Deflate64CountResult>;
  /** Rewrites them one at a time (those the last `count()` found, else it checks the library again), reporting each through `onProgress`. Holds the shared lock. */
  convert(onProgress?: (progress: ScanProgress) => void): Promise<ConvertDeflate64Result>;
}

/** Builds the converter around the library and the decoder; `lock` is the one shared with the other runs over the files. */
export function createDeflate64Converter(
  repo: LibraryRepository,
  decoder: Deflate64Decoder,
  notify: LibraryNotifier,
  lock: LibraryRunLock,
): Deflate64Converter {
  /** What the last `count()` found, used once by the next `convert()`. */
  let found: { id: string; path: string }[] | null = null;

  /** The library's CBZ that use Deflate64 (`id` and path). Cloud placeholders are skipped: reading them would download them. */
  const find = async (onProgress: (progress: ScanProgress) => void): Promise<{ id: string; path: string }[]> => {
    const books: { id: string; path: string }[] = [];
    const cbz = repo.list().filter((entry) => comicFormat(entry.path) === 'CBZ');
    for (const [index, entry] of cbz.entries()) {
      onProgress({ phase: 'importing', processed: index, total: cbz.length, currentFile: entry.path });
      if (await isOnlineOnly(entry.path)) continue;
      if (await decoder.hasDeflate64(entry.path).catch(() => false)) books.push({ id: entry.id, path: entry.path });
    }
    return books;
  };

  return {
    async count(onProgress = () => undefined) {
      if (!lock.tryStart('convert')) return { status: 'error', message: lock.busyMessage() };
      try {
        found = await find(onProgress);
        return { status: 'ok', count: found.length };
      } finally {
        onProgress({ phase: 'done', processed: 0, total: 0, currentFile: '' });
        lock.end();
      }
    },

    async convert(onProgress = () => undefined) {
      if (!lock.tryStart('convert')) return { status: 'error', message: lock.busyMessage() };
      const result = { converted: 0, failed: 0 };
      try {
        // A book removed or moved since the count is left out.
        const kept = found?.filter((book) => repo.get(book.id)?.path === book.path);
        found = null;
        const books = kept ?? (await find(onProgress));
        for (const [index, book] of books.entries()) {
          onProgress({ phase: 'importing', processed: index, total: books.length, currentFile: book.path });
          try {
            const { fileCount } = await decoder.convertDeflate64(book.path);
            repo.updateFileStats(book.id, fileCount, await stat(book.path).then((s) => s.size, () => 0));
            await decoder.removeThumbnail(book.path).catch(() => undefined);
            result.converted++;
          } catch {
            // The rewrite leaves the original as it was.
            result.failed++;
          }
        }
        if (result.converted > 0) notify({ scope: 'library' });
        return { status: 'ok', ...result };
      } finally {
        onProgress({ phase: 'done', processed: 0, total: 0, currentFile: '' });
        lock.end();
      }
    },
  };
}
