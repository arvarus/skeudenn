/**
 * Adding a folder to the library ("Ajouter un dossier"), once the user picked it: the folder is
 * watched, its comics are registered, then handed to the library organization. Kept out of the IPC
 * layer, which only opens the dialog, so it runs under Vitest.
 * @module
 */
import type { ScanProgress, ScanResult } from '../../shared/library';
import type { LibraryFolderRepository } from '../db/library-folder-repository';
import type { LibraryRepository } from '../db/library-repository';
import type { SettingsRepository } from '../db/settings-repository';
import type { ImageStatsScanner } from './image-stats-scanner';
import { NOTHING_ORGANIZED, type LibraryDecoder, type LibraryNotifier, type LibraryOrganizer } from './library-organization';
import { scanIntoLibrary } from './library-scanner';

/** What {@link addFolderToLibrary} works with; the IPC layer passes its own dependencies. */
export interface AddFolderDependencies {
  /** The library, as the active user sees it. */
  repo: LibraryRepository;
  /** The folders the library is built from; the added one is watched for the active user. */
  folders: LibraryFolderRepository;
  /** Where the folder is remembered as `lastScanFolder`. */
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

/**
 * Adds every comic under `directory` to the library, reporting file by file through `onProgress`.
 * Holds the shared lock (an `error` result when another run holds it), whose `cancel()` stops the scan
 * between two files: the comics added so far stay and are announced, the image measure still starts,
 * but nothing is organized (the user asked to stop, not to move files) and the result says `cancelled`.
 */
export async function addFolderToLibrary(
  { repo, folders, settings, decoder, notify, imageScanner, organizer, activeUser }: AddFolderDependencies,
  directory: string,
  onProgress: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  const signal = organizer.lock.tryStart('add');
  if (!signal) return { status: 'error', message: organizer.lock.busyMessage() };
  try {
    const startedBy = activeUser();
    settings.set('lastScanFolder', directory);
    notify({ scope: 'settings', values: { lastScanFolder: directory } });
    // Watched for the user who picked it, before the long scan: its books are then stored relative to it at once.
    folders.add(directory);
    const summary = await scanIntoLibrary(repo, directory, onProgress, (filePath) => decoder.inspect(filePath), signal);
    // The comics already in the library under that folder are stored relative to it from now on.
    repo.adoptRoots();
    notify({ scope: 'library' });
    // Another user is active now: their organized folder is not the one this addition was made for.
    // A stopped scan moves nothing: the user asked to stop, not to move files.
    const organize = activeUser() === startedBy && !summary.cancelled;
    const organization = organize ? await organizer.afterAdd(summary.addedEntries) : NOTHING_ORGANIZED;
    // The files are in: their pages are measured in the background, after the import.
    void imageScanner.kick();
    const { added, skipped, failed, failures, total, cancelled } = summary;
    return { status: 'ok', directory, added, skipped, failed, failures, total, cancelled, organization };
  } finally {
    organizer.lock.end();
  }
}
