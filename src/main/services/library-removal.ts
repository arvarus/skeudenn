/**
 * Removing books from the library (a book's remove button, the library page's selection bar, the
 * duplicates dialog): each entry leaves the database, and its file goes to the OS trash or is parked in
 * `.deletedBySkeudenn`. Kept out of the IPC layer, which only passes it Electron's trash, so it runs
 * under Vitest.
 * @module
 */
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { isSupportedComicFile } from '../../shared/comic';
import { t } from '../../shared/i18n';
import type { RemoveEntriesResult, RemoveEntryResult, ScanProgress } from '../../shared/library';
import { errorText } from '../../shared/errors';
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
  /** Parks a comic in `.deletedBySkeudenn` (see `parkComic()`), so a resynchronization doesn't add it back; `parkComic()` by default. */
  park?(comicPath: string, organizedRoot: string): Promise<void>;
}

/**
 * What became of one entry and its file (see {@link removeEntry}):
 * - `unknown`: no entry has that id, nothing was done;
 * - `trashed` / `parked`: the entry left the library and its file went to the trash or to `.deletedBySkeudenn`;
 * - `missing`: the entry left the library and its file was already gone, which is what the user wanted;
 * - `fileFailed`: the entry left the library but its file stayed where it was, `message` (translated) saying why.
 */
export type EntryRemoval =
  | { status: 'unknown' }
  | { status: 'trashed' | 'parked' | 'missing'; path: string }
  | { status: 'fileFailed'; path: string; message: string };

/** What {@link removeEntry} works with; the remover builds it. */
export interface EntryRemovalContext {
  repo: LibraryRepository;
  decoder: RemovalDecoder;
  files: RemovalFiles;
  /** The organized folder, where a comic inside it is parked (`''` when there is none). */
  organizedRoot: string;
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath).then(
    () => true,
    () => false,
  );
}

/**
 * Removes one entry: it leaves the database and the thumbnail cache first, then, with `deleteFile`, its
 * file and its cover and `.nfo` sidecars go to the OS trash, otherwise the comic and its sidecars are
 * parked. Only a supported comic file is touched: a stored path naming any other file (an edited export,
 * a database from a shared folder) is left alone and reported as `fileFailed`. Neither notifies nor takes
 * the lock: its callers do, once per call.
 */
export async function removeEntry(context: EntryRemovalContext, id: string, deleteFile: boolean): Promise<EntryRemoval> {
  const { repo, decoder, files, organizedRoot } = context;
  const entry = repo.get(id);
  if (!entry) return { status: 'unknown' };
  const filePath = entry.path;
  repo.remove(id);
  await decoder.removeThumbnail(filePath).catch(() => undefined);
  if (!isSupportedComicFile(filePath)) {
    return {
      status: 'fileFailed',
      path: filePath,
      message: t('errors:library.notComicFile', { file: path.basename(filePath) }),
    };
  }
  if (!(await exists(filePath))) return { status: 'missing', path: filePath };
  if (!deleteFile) {
    // Parked, not left in place, so that the next resynchronization doesn't add it back.
    try {
      await (files.park ?? parkComic)(filePath, organizedRoot);
      return { status: 'parked', path: filePath };
    } catch (error) {
      return { status: 'fileFailed', path: filePath, message: t('errors:library.parkFailed', { message: errorText(error) }) };
    }
  }
  // To the trash, so a wrong choice can still be undone; the cover and the .nfo beside the comic go along.
  try {
    await files.trash(filePath);
  } catch (error) {
    // Gone meanwhile: what the user wanted.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (await exists(filePath))) {
      return { status: 'fileFailed', path: filePath, message: t('errors:library.trashFailed', { message: errorText(error) }) };
    }
  }
  await trashSidecars(filePath, (sidecar) => files.trash(sidecar));
  return { status: 'trashed', path: filePath };
}

/** The removal as the handlers use it; built once in `main.ts`. */
export interface LibraryRemover {
  /**
   * Removes the entry `id` through {@link removeEntry} and announces it (`library` with `removed`, then
   * `readingLists`), even when it is unknown. Holds the shared lock for the time of the removal (an `error`
   * result, nothing removed, when another run holds it); a single book is not stoppable. `error` too when the
   * entry left the library but its file stayed (couldn't be trashed or parked, or isn't a comic); a file
   * already gone is fine.
   */
  removeOne(id: string, deleteFile: boolean): Promise<RemoveEntryResult>;
  /**
   * Removes the entries `ids` (unknown ones skipped) one at a time through {@link removeEntry}, reporting
   * each through `onProgress`. A file that stayed (couldn't be trashed or parked, or isn't a comic) is
   * counted in `filesFailed`, its entry being removed anyway; one already gone counts as neither deleted
   * nor failed. Holds the shared lock (an error result when another run holds it), whose `cancel()` stops
   * it before its next entry, with `cancelled` set: the entries removed so far stay removed and are announced.
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
  const context = (): EntryRemovalContext => ({
    repo,
    decoder,
    files,
    organizedRoot: settings.getAll().libraryOrganizationFolder,
  });
  return {
    async removeOne(id, deleteFile) {
      if (!lock.tryStart('remove')) return { status: 'error', message: lock.busyMessage() };
      try {
        const outcome = await removeEntry(context(), id, deleteFile);
        return outcome.status === 'fileFailed' ? { status: 'error', message: outcome.message } : { status: 'ok' };
      } finally {
        notify({ scope: 'library', removed: [id] });
        // The book left the reading lists it was in.
        notify({ scope: 'readingLists' });
        lock.end();
      }
    },

    async removeMany(ids, deleteFiles, onProgress = () => undefined) {
      const signal = lock.tryStart('remove');
      if (!signal) return { status: 'error', message: lock.busyMessage() };
      const result = { removed: 0, filesDeleted: 0, filesFailed: 0, cancelled: false };
      const removed: string[] = [];
      try {
        const unique = [...new Set(ids)];
        const removal = context();
        for (const [index, id] of unique.entries()) {
          if (signal.aborted) {
            result.cancelled = true;
            break;
          }
          const entry = repo.get(id);
          if (!entry) continue;
          onProgress({ phase: 'importing', processed: index, total: unique.length, currentFile: entry.path });
          const outcome = await removeEntry(removal, id, deleteFiles);
          if (outcome.status === 'unknown') continue;
          removed.push(id);
          result.removed++;
          if (outcome.status === 'trashed') result.filesDeleted++;
          else if (outcome.status === 'fileFailed') result.filesFailed++;
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
