/**
 * Converting the CBR of the organized library to CBZ. A RAR can't be rewritten, so the books in that
 * format miss the options that edit the archive (cleaning…). Each CBR of the organized folder is
 * written as a CBZ beside it, the entry follows (same id: progress, rating, tags and lists are kept)
 * and the CBR goes to `.deletedBySkeudenn` at the root of the organized folder, from where the user
 * empties it when they want. Kept out of the IPC layer, which only calls it, so it runs under Vitest.
 * @module
 */
import { lstat, readdir, rm, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { comicFormat } from '../../shared/comic';
import {
  type ConvertCbrResult,
  type ConvertCountResult,
  type EmptyDeletedResult,
  type ScanProgress,
} from '../../shared/library';
import type { LibraryRepository } from '../db/library-repository';
import type { SettingsRepository } from '../db/settings-repository';
import { isInside } from '../path-containment';
import type { ConvertedArchive } from './cbr-converter';
import { coverSidecarPath } from './cover-sidecar';
import { moveFile } from './library-organizer';
import type { LibraryNotifier, LibraryRunLock } from './library-organization';
import { nfoPathFor } from './nfo';
import { firstFreeName, markParked, organizedFolderProblem, requireTrashFolder, usableTrashFolder } from './organized-folder';

/** The part of the decoder process the conversion calls. */
export interface ConversionDecoder {
  /** Writes a CBR as a CBZ, checked before it appears. */
  convertCbr(cbrPath: string, cbzPath: string): Promise<ConvertedArchive>;
  /** Deletes a book's cached thumbnail. */
  removeThumbnail(filePath: string): Promise<void>;
}

/** The conversion as the handlers use it; built once in `main.ts`. */
export interface CbrConverter {
  /** How many CBR of the organized folder can be converted, and what `.deletedBySkeudenn` holds. An error when the organization is off or its folder unreachable. */
  count(): Promise<ConvertCountResult>;
  /**
   * Converts them one at a time, reporting each through `onProgress`. Holds the shared lock, whose `cancel()`
   * stops it before its next book (the one being converted is finished), with `cancelled` set.
   */
  convert(onProgress?: (progress: ScanProgress) => void): Promise<ConvertCbrResult>;
  /**
   * Deletes everything in `.deletedBySkeudenn` for good, one item at a time, reporting each through `onProgress`.
   * Holds the shared lock, whose `cancel()` stops it before its next item, with `cancelled` set.
   */
  emptyDeleted(onProgress?: (progress: ScanProgress) => void): Promise<EmptyDeletedResult>;
  /**
   * Deletes for good what has been in `.deletedBySkeudenn` for `days` days or more (the automatic emptying).
   * Does nothing, returning `null`, when the organization is off, the folder unreachable or another run holds the lock.
   * Holds the lock too, so `cancel()` stops it like `emptyDeleted()`.
   */
  emptyDeletedOlderThan(days: number, now?: Date): Promise<EmptyDeletedResult | null>;
}

/** Total size of a file, or of everything under a folder (the orphan folders are parked whole); 0 when unreadable. Links are not followed. */
async function sizeOf(target: string): Promise<number> {
  const info = await lstat(target).catch(() => null);
  if (!info) return 0;
  if (!info.isDirectory()) return info.size;
  let bytes = 0;
  for (const name of await readdir(target).catch(() => [] as string[])) bytes += await sizeOf(path.join(target, name));
  return bytes;
}

/** What is at the top of `folder` (files from the conversion, folders from the orphan cleaning) and the total size; both 0 when it doesn't exist. */
async function folderContents(folder: string): Promise<{ names: string[]; bytes: number }> {
  const names = await readdir(folder).catch(() => [] as string[]);
  let bytes = 0;
  for (const name of names) bytes += await sizeOf(path.join(folder, name));
  return { names, bytes };
}

/** When an item of the trash was parked: the latest of its modification and change times (parking touches it, see `markParked()`). */
async function parkedAt(target: string): Promise<number> {
  const info = await lstat(target).catch(() => null);
  return info ? Math.max(info.mtimeMs, info.ctimeMs) : 0;
}

/** Builds the converter around the library and the decoder; `lock` is the one shared with the other runs over the files. */
export function createCbrConverter(
  repo: LibraryRepository,
  settings: SettingsRepository,
  decoder: ConversionDecoder,
  notify: LibraryNotifier,
  lock: LibraryRunLock,
): CbrConverter {
  /** The organized folder when the organization is on and the folder is there, else the error to return. */
  const usableRoot = async (): Promise<{ root: string } | { status: 'error'; message: string }> => {
    const { libraryOrganization: mode, libraryOrganizationFolder: root } = settings.getAll();
    const problem = await organizedFolderProblem(mode, root);
    return problem === null ? { root } : { status: 'error', message: problem };
  };

  /**
   * Deletes the items of the trash whose parking time `shouldDelete` accepts, one at a time, and the folder itself once
   * it is empty; an aborted `signal` stops it before its next item. A trash that is a link or a junction
   * (`usableTrashFolder()`) is left alone: nothing is deleted.
   */
  const deleteFromTrash = async (
    root: string,
    shouldDelete: (parkedAt: number) => boolean,
    signal: AbortSignal,
    onProgress: (progress: ScanProgress) => void,
  ): Promise<EmptyDeletedResult> => {
    const result = { deleted: 0, bytesFreed: 0, failed: 0, cancelled: false };
    const folder = await usableTrashFolder(root);
    if (folder === null) return { status: 'ok', ...result };
    const names = await readdir(folder).catch(() => [] as string[]);
    for (const [index, name] of names.entries()) {
      if (signal.aborted) {
        result.cancelled = true;
        break;
      }
      const file = path.join(folder, name);
      onProgress({ phase: 'importing', processed: index, total: names.length, currentFile: file });
      if (!shouldDelete(await parkedAt(file))) continue;
      const size = await sizeOf(file);
      try {
        await rm(file, { recursive: true });
        result.deleted++;
        result.bytesFreed += size;
      } catch {
        result.failed++;
      }
    }
    await rmdir(folder).catch(() => undefined);
    return { status: 'ok', ...result };
  };

  const convertibleIds = (root: string) =>
    repo
      .list()
      .filter((entry) => comicFormat(entry.path) === 'CBR' && isInside(root, entry.path))
      .map((entry) => entry.id);

  return {
    async count() {
      const usable = await usableRoot();
      if (!('root' in usable)) return usable;
      // A trash that is a link or a junction is not read: it counts as empty.
      const trash = await usableTrashFolder(usable.root);
      const deleted = trash === null ? { names: [], bytes: 0 } : await folderContents(trash);
      return {
        status: 'ok',
        count: convertibleIds(usable.root).length,
        folder: usable.root,
        deletedFiles: deleted.names.length,
        deletedBytes: deleted.bytes,
      };
    },

    async convert(onProgress = () => undefined) {
      const usable = await usableRoot();
      if (!('root' in usable)) return usable;
      const signal = lock.tryStart('convert');
      if (!signal) return { status: 'error', message: lock.busyMessage() };
      const { root } = usable;
      const result = { converted: 0, failed: 0, cancelled: false };
      try {
        const ids = convertibleIds(root);
        for (const [index, id] of ids.entries()) {
          // Checked between two books only: a conversion under way is finished, so a book is never left half-moved.
          if (signal.aborted) {
            result.cancelled = true;
            break;
          }
          const entry = repo.get(id);
          if (!entry) continue;
          const from = entry.path;
          onProgress({ phase: 'importing', processed: index, total: ids.length, currentFile: from });
          const stem = path.basename(from, path.extname(from));
          let to: string | null = null;
          // Where the CBR was parked, until the entry names the CBZ: a failure puts it back.
          let parked: string | null = null;
          // Once the entry names the CBZ, that file is the book: a later hiccup must not delete it.
          let committed = false;
          try {
            // Checked for each book, before converting: a trash that is a link or a junction fails the book, nothing is moved through it.
            const trash = await requireTrashFolder(root);
            to = await firstFreeName(path.dirname(from), stem, '.cbz', (candidate) => !repo.hasPath(candidate));
            const { fileCount } = await decoder.convertCbr(from, to);
            // The CBR leaves the library folders for good only once the CBZ exists and was checked.
            const target = await firstFreeName(trash, path.basename(from, path.extname(from)), path.extname(from), () => true);
            await moveFile(from, target);
            parked = target;
            await markParked(target);
            // The database refused (or threw, "database is locked"…): handled below, the CBR goes back.
            if (!repo.updatePath(id, to)) throw new Error('path refused');
            committed = true;
            repo.updateFileStats(id, fileCount, await stat(to).then((s) => s.size, () => 0));
            // The cover kept beside the comic and its `.nfo` follow it (best effort, regenerated when missing).
            await moveFile(coverSidecarPath(from), coverSidecarPath(to)).catch(() => undefined);
            await moveFile(nfoPathFor(from), nfoPathFor(to)).catch(() => undefined);
            await decoder.removeThumbnail(from).catch(() => undefined);
            result.converted++;
          } catch {
            // Before the entry was pointed at the CBZ, nothing half-done is left: it still names the CBR, put back where it was.
            if (!committed) {
              if (parked) await moveFile(parked, from).catch(() => undefined);
              if (to) await rm(to, { force: true }).catch(() => undefined);
            }
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

    async emptyDeleted(onProgress = () => undefined) {
      const usable = await usableRoot();
      if (!('root' in usable)) return usable;
      const signal = lock.tryStart('convert');
      if (!signal) return { status: 'error', message: lock.busyMessage() };
      try {
        return await deleteFromTrash(usable.root, () => true, signal, onProgress);
      } finally {
        onProgress({ phase: 'done', processed: 0, total: 0, currentFile: '' });
        lock.end();
      }
    },

    async emptyDeletedOlderThan(days, now = new Date()) {
      const usable = await usableRoot();
      if (!('root' in usable)) return null;
      const signal = lock.tryStart('convert');
      if (!signal) return null;
      try {
        const limit = now.getTime() - days * 24 * 60 * 60 * 1000;
        // No window asked for it: its progress goes nowhere.
        return await deleteFromTrash(usable.root, (parked) => parked <= limit, signal, () => undefined);
      } finally {
        lock.end();
      }
    },
  };
}
