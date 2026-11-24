/**
 * Removing a selection of books from the library (the library page's selection bar, the duplicates
 * dialog): each entry leaves the database, and its file goes to the OS trash or is parked in
 * `.deletedByTankobon`. Kept out of the IPC layer, which only passes it Electron's trash, so it runs
 * under Vitest.
 * @module
 */
import type { RemoveEntriesResult, ScanProgress } from '../../shared/library';
import type { LibraryRepository } from '../db/library-repository';
import type { SettingsRepository } from '../db/settings-repository';
import type { LibraryNotifier, LibraryRunLock } from './library-organization';
import { parkComic } from './park-comic';
import { trashSidecars } from './sidecars';

/** The part of the decoder process the removal calls. */
export interface RemovalDecoder {
  /** Deletes a book's cached thumbnail. */
  removeThumbnail(filePath: string): Promise<void>;
}

/** Where the files of the removed books go; the IPC layer passes Electron's `shell.trashItem`. */
export interface RemovalFiles {
  /** Moves a file to the OS trash (recoverable). */
  trash(filePath: string): Promise<void>;
  /** Parks a comic in `.deletedByTankobon` (see `parkComic()`), so a resynchronization doesn't add it back; `parkComic()` by default. */
  park?(comicPath: string, organizedRoot: string): Promise<void>;
}

/** The removal as the handlers use it; built once in `main.ts`. */
export interface LibraryRemover {
  /**
   * Removes the entries `ids` (unknown ones skipped) one at a time, reporting each through `onProgress`.
   * With `deleteFiles`, each file and its cover and `.nfo` sidecars go to the OS trash; otherwise the
   * comic is parked. A file that can't be trashed or parked is counted in `filesFailed`, its entry is
   * removed anyway. Holds the shared lock (an error result when another run holds it), whose `cancel()`
   * stops it before its next entry, with `cancelled` set: the entries removed so far stay removed and
   * are announced.
   */
  removeMany(ids: string[], deleteFiles: boolean, onProgress?: (progress: ScanProgress) => void): Promise<RemoveEntriesResult>;
}

/**
 * Builds the remover around the library; `lock` is the one shared with the other runs over the files,
 * since parking or trashing a file while a walk registers it, or while the organizer moves it, would
 * leave the library and the disk disagreeing.
 */
export function createLibraryRemover(
  repo: LibraryRepository,
  settings: SettingsRepository,
  decoder: RemovalDecoder,
  notify: LibraryNotifier,
  lock: LibraryRunLock,
  files: RemovalFiles,
): LibraryRemover {
  const park = files.park ?? parkComic;
  return {
    async removeMany(ids, deleteFiles, onProgress = () => undefined) {
      const signal = lock.tryStart('remove');
      if (!signal) return { status: 'error', message: lock.busyMessage() };
      const result = { removed: 0, filesDeleted: 0, filesFailed: 0, cancelled: false };
      const removed: string[] = [];
      try {
        const unique = [...new Set(ids)];
        for (const [index, id] of unique.entries()) {
          if (signal.aborted) {
            result.cancelled = true;
            break;
          }
          const entry = repo.get(id);
          if (!entry) continue;
          onProgress({ phase: 'importing', processed: index, total: unique.length, currentFile: entry.path });
          repo.remove(id);
          removed.push(id);
          result.removed++;
          await decoder.removeThumbnail(entry.path).catch(() => undefined);
          if (!deleteFiles) {
            // Parked, not left in place, so that the next resynchronization doesn't add it back.
            try {
              await park(entry.path, settings.getAll().libraryOrganizationFolder);
            } catch {
              result.filesFailed++;
            }
            continue;
          }
          // To the trash, so a wrong choice can still be undone; the cover and the .nfo beside the comic go along.
          try {
            await files.trash(entry.path);
            result.filesDeleted++;
            await trashSidecars(entry.path, (sidecar) => files.trash(sidecar));
          } catch {
            result.filesFailed++;
          }
        }
        return { status: 'ok', ...result };
      } finally {
        // Announced even when stopped: the entries removed so far are gone.
        if (removed.length > 0) {
          notify({ scope: 'library', removed });
          notify({ scope: 'readingLists' });
        }
        onProgress({ phase: 'done', processed: 0, total: 0, currentFile: '' });
        lock.end();
      }
    },
  };
}
