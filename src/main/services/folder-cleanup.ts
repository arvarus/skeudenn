/**
 * Cleaning the orphan folders of the organized library. Moving, converting or deleting books leaves
 * folders behind that hold no book any more, only their `.nfo` and cover images. Each such folder is
 * moved to `.deletedBySkeudenn` at the root of the organized folder, from where the user empties it
 * when they want. Only the organized folder is walked: the folders books are added from are never
 * touched. Kept out of the IPC layer, which only calls it, so it runs under Vitest.
 * @module
 */
import { cp, mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { isSupportedComicFile } from '../../shared/comic';
import {
  isHiddenFolderName,
  type CleanFoldersResult,
  type OrphanFoldersCountResult,
  type ScanProgress,
} from '../../shared/library';
import type { SettingsRepository } from '../db/settings-repository';
import type { LibraryRunLock } from './library-organization';
import { firstFreeName, markParked, organizedFolderProblem, requireTrashFolder } from './organized-folder';

/** Extensions of the files an orphan folder may still hold: sidecars (`.nfo`) and cover images. */
const SIDECAR_EXTENSIONS = new Set(['.nfo', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);

/** The cleaning of the organized folder as the handlers use it; built once in `main.ts`. */
export interface FolderCleaner {
  /** How many orphan folders the organized folder holds. An error when the organization is off or its folder unreachable. */
  count(): Promise<OrphanFoldersCountResult>;
  /**
   * Moves them to `.deletedBySkeudenn`, reporting each through `onProgress`. Holds the shared lock, whose `cancel()`
   * stops it before its next folder (the one being moved is finished), with `cancelled` set.
   */
  clean(onProgress?: (progress: ScanProgress) => void): Promise<CleanFoldersResult>;
}

/**
 * The orphan folders under `root`, outermost first: a folder that holds no book, only sidecars, covers
 * and other orphan folders. `root` itself is never listed; hidden folders (`.deletedBySkeudenn` included) are neither
 * entered nor listed, and keep the folder holding one; a folder that can't be read, or holds any other file (or a
 * link), is kept.
 */
export async function findOrphanFolders(root: string): Promise<string[]> {
  /** `orphan` when nothing in `dir` is worth keeping; else `found`, the orphans inside it. */
  async function scan(dir: string, isRoot: boolean): Promise<{ orphan: boolean; found: string[] }> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
    if (!entries) return { orphan: false, found: [] };
    let blocked = false;
    const found: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // A hidden folder (the parking one, a `.cache`…) is never entered nor listed; one inside a folder keeps that
        // folder, which would otherwise be moved with it.
        if (isHiddenFolderName(entry.name)) {
          blocked = true;
          continue;
        }
        const child = path.join(dir, entry.name);
        const result = await scan(child, false);
        if (result.orphan) found.push(child);
        else {
          blocked = true;
          found.push(...result.found);
        }
      } else if (
        !entry.isFile() ||
        isSupportedComicFile(entry.name) ||
        !SIDECAR_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        blocked = true;
      }
    }
    // An orphan folder is moved whole: its orphan children go with it and are not listed.
    return blocked || isRoot ? { orphan: false, found } : { orphan: true, found: [] };
  }
  return (await scan(root, true)).found;
}

/** Moves a folder: a rename, else (another drive) a copy then a deletion, the copy removed again if the original can't be. */
async function moveFolder(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await cp(from, to, { recursive: true, errorOnExist: true, force: false });
    try {
      await rm(from, { recursive: true });
    } catch (removeError) {
      await rm(to, { recursive: true, force: true }).catch(() => undefined);
      throw removeError;
    }
  }
}

/** Builds the cleaner around the settings; `lock` is the one shared with the other runs over the files. */
export function createFolderCleaner(settings: SettingsRepository, lock: LibraryRunLock): FolderCleaner {
  /** The organized folder when the organization is on and the folder is there, else the error to return. */
  const usableRoot = async (): Promise<{ root: string } | { status: 'error'; message: string }> => {
    const { libraryOrganization: mode, libraryOrganizationFolder: root } = settings.getAll();
    const problem = await organizedFolderProblem(mode, root);
    return problem === null ? { root } : { status: 'error', message: problem };
  };

  return {
    async count() {
      const usable = await usableRoot();
      if (!('root' in usable)) return usable;
      return { status: 'ok', count: (await findOrphanFolders(usable.root)).length, folder: usable.root };
    },

    async clean(onProgress = () => undefined) {
      const usable = await usableRoot();
      if (!('root' in usable)) return usable;
      const signal = lock.tryStart('folders');
      if (!signal) return { status: 'error', message: lock.busyMessage() };
      const result = { moved: 0, failed: 0, cancelled: false };
      try {
        const orphans = await findOrphanFolders(usable.root);
        for (const [index, folder] of orphans.entries()) {
          if (signal.aborted) {
            result.cancelled = true;
            break;
          }
          onProgress({ phase: 'importing', processed: index, total: orphans.length, currentFile: folder });
          try {
            // Checked for each folder: a trash that is a link or a junction fails the move, nothing goes through it.
            const trash = await requireTrashFolder(usable.root);
            await mkdir(trash, { recursive: true });
            const parked = await firstFreeName(trash, path.basename(folder));
            await moveFolder(folder, parked);
            await markParked(parked);
            result.moved++;
          } catch {
            result.failed++;
          }
        }
        return { status: 'ok', ...result };
      } finally {
        onProgress({ phase: 'done', processed: 0, total: 0, currentFile: '' });
        lock.end();
      }
    },
  };
}
