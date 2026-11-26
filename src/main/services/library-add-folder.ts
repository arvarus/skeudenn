/**
 * Adding folders to the library ("Ajouter des dossiers…"), once the user picked them: each folder is
 * scanned, its comics are registered, then all of them are handed to the library organization at once.
 * The folders are watched (resynchronized) or not, as the user chose. Kept out of the IPC layer, which only
 * opens the dialog, so it runs under Vitest.
 * @module
 */
import path from 'node:path';

import {
  MAX_REPORTED_FAILURES,
  type ScanFailure,
  type ScanProgress,
  type ScanResult,
} from '../../shared/library';
import type { LibraryFolderRepository } from '../db/library-folder-repository';
import type { LibraryRepository } from '../db/library-repository';
import type { SettingsRepository } from '../db/settings-repository';
import { normalizeFolders, startingFolder } from './folder-selection';
import type { ImageStatsScanner } from './image-stats-scanner';
import { NOTHING_ORGANIZED, type LibraryDecoder, type LibraryNotifier, type LibraryOrganizer } from './library-organization';
import { scanIntoLibrary } from './library-scanner';

/** What {@link addFolderToLibrary} works with; the IPC layer passes its own dependencies. */
export interface AddFolderDependencies {
  /** The library, as the active user sees it. */
  repo: LibraryRepository;
  /** The folders the library is built from; the added ones are watched for the active user when `watch` is set. */
  folders: LibraryFolderRepository;
  /** Where the folders are remembered as `lastScanFolder`. */
  settings: SettingsRepository;
  /** Opens each new file to count its pages (and cache its cover). */
  decoder: Pick<LibraryDecoder, 'inspect'>;
  /** Announces the writes to every window. */
  notify: LibraryNotifier;
  /** The background measure of the pages, started once the files are in. */
  imageScanner: Pick<ImageStatsScanner, 'kick'>;
  /** The library organization, and the lock shared by every run over the files. */
  organizer: Pick<LibraryOrganizer, 'afterAdd' | 'lock'>;
  /** The active user; the organization is skipped when it changed during the scan. */
  activeUser: () => string;
}

/** What the user decided about the folders in the confirmation step. */
export interface AddFolderOptions {
  /**
   * Whether the folders become library folders of the active user (listed in Paramètres › Bibliothèque,
   * walked by every resynchronization). Off, the comics are added like files added one by one: nothing is
   * remembered about the folders, and a comic under an existing library folder is still stored relative to it.
   */
  watch: boolean;
}

/**
 * Adds every comic under `directories` to the library, one folder after the other (a repeated folder, or
 * one nested in another of the list, is left out: its comics come with the parent's), reporting file by
 * file through `onProgress`, which carries `folder` once there are several. The whole addition holds the
 * shared lock once (an `error` result when another run holds it) and ends with a single `done` progress,
 * a single organization of every comic added (so the `ask` mode asks once) and a single start of the image
 * measure. The lock's `cancel()` stops the scan between two files and skips the folders not started: the
 * comics added so far stay and are announced (and the folders started stay watched, with `watch`), but
 * nothing is organized (the user asked to stop, not to move files) and the result says `cancelled`.
 */
export async function addFolderToLibrary(
  { repo, folders, settings, decoder, notify, imageScanner, organizer, activeUser }: AddFolderDependencies,
  directories: readonly string[],
  { watch }: AddFolderOptions,
  onProgress: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  const toScan = normalizeFolders(directories);
  if (toScan.length === 0) return { status: 'cancelled' };
  const signal = organizer.lock.tryStart('add');
  if (!signal) return { status: 'error', message: organizer.lock.busyMessage() };
  try {
    const startedBy = activeUser();
    const directory = startingFolder(toScan);
    settings.set('lastScanFolder', directory);
    notify({ scope: 'settings', values: { lastScanFolder: directory } });

    let added = 0;
    let skipped = 0;
    let failed = 0;
    let total = 0;
    const failures: ScanFailure[] = [];
    const addedEntries: { id: string; path: string }[] = [];
    let cancelled = false;
    for (const [index, folder] of toScan.entries()) {
      if (signal.aborted) {
        cancelled = true;
        break;
      }
      // Watched for the user who picked it, before the long scan: its books are then stored relative to it at once.
      if (watch) folders.add(folder);
      const label = toScan.length > 1 ? { index: index + 1, count: toScan.length, name: path.basename(folder) || folder } : undefined;
      const summary = await scanIntoLibrary(
        repo,
        folder,
        // One `done` for the whole addition, below: a folder's own would end the progress after the first.
        (progress) => progress.phase !== 'done' && onProgress(label ? { ...progress, folder: label } : progress),
        (filePath) => decoder.inspect(filePath),
        signal,
      );
      added += summary.added;
      skipped += summary.skipped;
      failed += summary.failed;
      total += summary.total;
      failures.push(...summary.failures.slice(0, Math.max(0, MAX_REPORTED_FAILURES - failures.length)));
      addedEntries.push(...summary.addedEntries);
      if (summary.cancelled) {
        cancelled = true;
        break;
      }
    }
    onProgress({ phase: 'done', processed: total, total, currentFile: '' });
    // The comics already in the library under a watched folder are stored relative to it from now on.
    if (watch) repo.adoptRoots();
    notify({ scope: 'library' });
    // Another user is active now: their organized folder is not the one this addition was made for.
    // A stopped scan moves nothing: the user asked to stop, not to move files.
    const organize = activeUser() === startedBy && !cancelled;
    const organization = organize ? await organizer.afterAdd(addedEntries) : NOTHING_ORGANIZED;
    // The files are in: their pages are measured in the background, after the import.
    void imageScanner.kick();
    return { status: 'ok', directory, folders: toScan.length, added, skipped, failed, failures, total, cancelled, organization };
  } finally {
    organizer.lock.end();
  }
}
