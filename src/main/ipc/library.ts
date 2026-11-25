import type { IpcMainInvokeEvent } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { SUPPORTED_COMIC_EXTENSIONS } from '../../shared/comic';
import { t } from '../../shared/i18n';
import {
  MAX_COVER_BYTES,
  type AddFileResult,
  type ImageScanProgress,
  type PickOrganizationFolderResult,
  type RelinkFolderResult,
  type ScanProgress,
  type ScanResult,
  type SetCoverResult,
} from '../../shared/library';
import { errorText } from '../../shared/errors';
import type { LibraryFolderRepository } from '../db/library-folder-repository';
import type { LibraryRepository } from '../db/library-repository';
import type { SettingsRepository } from '../db/settings-repository';
import { isOnlineOnly } from '../services/cloud-files';
import type { DecoderClient } from '../decoder/decoder-client';
import type { ImageStatsScanner } from '../services/image-stats-scanner';
import type { CbrConverter } from '../services/cbr-conversion';
import type { Deflate64Converter } from '../services/deflate64-conversion';
import type { FolderCleaner } from '../services/folder-cleanup';
import { addFolderToLibrary } from '../services/library-add-folder';
import type { LibraryCleaner } from '../services/library-cleanup';
import type { LibraryRemover } from '../services/library-removal';
import { NOTHING_ORGANIZED, type LibraryOrganizer, type Resynchronizer } from '../services/library-organization';
import type { StartupOrganization } from './startup-organization';
import { openErrorMessage } from '../services/open-error';
import { readNfoFor } from '../services/nfo';
import { broadcast } from './broadcast';
import { lastOpenedDirectory } from './comic';
import type { NotifyDataChange } from './data-changes';
import { existingDirectory, openDialogFor } from './dialogs';
import { handle } from './handle';
import {
  MAX_PATH_LENGTH,
  args,
  booleanArg,
  expectBytes,
  expectIdArray,
  expectInteger,
  expectMetadataUpdate,
  expectNonEmptyString,
  expectStringArray,
  idArg,
  pageIndexArg,
} from './validate';

// Channel names are shared with preload.ts: keep them in sync.
export const LIBRARY_CHANNELS = {
  list: 'library:list',
  addFile: 'library:add-file',
  addFolder: 'library:add-folder',
  /** Main → renderer, while `addFolder` runs. */
  scanProgress: 'library:scan-progress',
  remove: 'library:remove',
  removeMany: 'library:remove-many',
  listFolders: 'library:list-folders',
  removeFolder: 'library:remove-folder',
  listUnlinkedFolders: 'library:list-unlinked-folders',
  relinkFolder: 'library:relink-folder',
  resync: 'library:resync',
  cancelResync: 'library:cancel-resync',
  resyncStatus: 'library:resync-status',
  takeStartupOrganization: 'library:take-startup-organization',
  /** Main → renderer: what the organization did after the start-up resynchronization is waiting (see `takeStartupOrganization`). */
  startupOrganization: 'library:startup-organization',
  updateProgress: 'library:update-progress',
  updateRating: 'library:update-rating',
  updateTags: 'library:update-tags',
  updateMetadata: 'library:update-metadata',
  updateMetadataMany: 'library:update-metadata-many',
  thumbnail: 'library:thumbnail',
  setCover: 'library:set-cover',
  imageScanStatus: 'library:image-scan-status',
  /** Main → renderer, while the background measure of the pages runs. */
  imageScanProgress: 'library:image-scan-progress',
  pickOrganizationFolder: 'library:pick-organization-folder',
  organize: 'library:organize',
  countUnorganized: 'library:count-unorganized',
  organizeAll: 'library:organize-all',
  analyzeCleanup: 'library:analyze-cleanup',
  applyCleanup: 'library:apply-cleanup',
  cancelCleanup: 'library:cancel-cleanup',
  cancelRun: 'library:cancel-run',
  countConvertible: 'library:count-convertible',
  convertCbr: 'library:convert-cbr',
  countDeflate64: 'library:count-deflate64',
  convertDeflate64: 'library:convert-deflate64',
  emptyDeleted: 'library:empty-deleted',
  countOrphanFolders: 'library:count-orphan-folders',
  cleanFolders: 'library:clean-folders',
} as const;

/** Sends the state of the background measure to every open window (one being closed is skipped). */
export function broadcastImageScanProgress(progress: ImageScanProgress): void {
  broadcast(LIBRARY_CHANNELS.imageScanProgress, progress);
}

/**
 * Sends a run's progress to every open window (one being closed is skipped): the resynchronization started
 * at launch, which no window asked for, is shown by all of them.
 */
export function broadcastScanProgress(progress: ScanProgress): void {
  broadcast(LIBRARY_CHANNELS.scanProgress, progress);
}

/** Tells every window that the organization's outcome of the start-up resynchronization is waiting; announced without payload, so a window takes it once. */
export function announceStartupOrganization(): void {
  broadcast(LIBRARY_CHANNELS.startupOrganization);
}

/** What {@link registerLibraryIpc} works with, built once in `main.ts`. */
export interface LibraryIpcDependencies {
  /** The library, as the active user sees it. */
  repo: LibraryRepository;
  /** The folders the library is built from. */
  folders: LibraryFolderRepository;
  /** The resynchronization with those folders. */
  resynchronizer: Resynchronizer;
  /** The settings (the last folder added, the organized folder). */
  settingsRepo: SettingsRepository;
  /** The decoder process: covers and page counts. */
  decoder: DecoderClient;
  /** Announces a write to every window. */
  notify: NotifyDataChange;
  /** The background measure of the pages. */
  imageScanner: ImageStatsScanner;
  /** The library organization. */
  organizer: LibraryOrganizer;
  /** The cleaning of the non-image files of the archives. */
  cleaner: LibraryCleaner;
  /** The conversion of the CBR to CBZ. */
  converter: CbrConverter;
  /** Rewrites the Deflate64 CBZ. */
  deflate64: Deflate64Converter;
  /** The cleaning of the orphan folders. */
  folderCleaner: FolderCleaner;
  /** The removal of a selection of books. */
  remover: LibraryRemover;
  /** The user a long run is for is the one who started it, even if the app is switched to another meanwhile. */
  activeUser: () => string;
  /** What the organization did after the start-up resynchronization, until a window takes it. */
  startupOrganization: StartupOrganization;
}

/**
 * The listener that forwards a long run's progress to the window that started it over `library:scan-progress`.
 * The window may be gone (closed mid-run): dropping the update is enough.
 */
function scanProgressTo(event: IpcMainInvokeEvent): (progress: ScanProgress) => void {
  return (progress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(LIBRARY_CHANNELS.scanProgress, progress);
    }
  };
}

export function registerLibraryIpc({
  repo,
  folders,
  resynchronizer,
  settingsRepo,
  decoder,
  notify,
  imageScanner,
  organizer,
  cleaner,
  converter,
  deflate64,
  folderCleaner,
  remover,
  activeUser,
  startupOrganization,
}: LibraryIpcDependencies): void {
  /** Announces the new state of entries a handler just wrote (the ones that still exist). */
  const notifyUpserted = (...ids: string[]) => {
    const upserted = ids.flatMap((id) => repo.get(id) ?? []);
    if (upserted.length > 0) notify({ scope: 'library', upserted });
  };

  handle(LIBRARY_CHANNELS.list, args(), () => repo.list());

  handle(LIBRARY_CHANNELS.addFile, args(), async (event): Promise<AddFileResult> => {
    const options: Electron.OpenDialogOptions = {
      title: t('dialogs:addFile'),
      properties: ['openFile'],
      filters: [{ name: t('dialogs:comicFiles'), extensions: [...SUPPORTED_COMIC_EXTENSIONS] }],
      defaultPath: await lastOpenedDirectory(repo),
    };
    const { canceled, filePaths } = await openDialogFor(event, options);
    if (canceled || filePaths.length === 0) {
      return { status: 'cancelled' };
    }

    // Held from here to the end, the organization included: a walk or a move must not meet this one.
    if (!organizer.lock.tryStart('add')) return { status: 'error', message: organizer.lock.busyMessage() };
    try {
      const filePath = filePaths[0];
      const title = path.basename(filePath, path.extname(filePath));
      if (repo.hasPath(filePath)) {
        return { status: 'exists', title };
      }
      let id: string | null;
      try {
        // Same path as a scanned file: the decoder counts the pages and caches the cover.
        const { pageCount, fileCount } = await decoder.inspect(filePath);
        const { size } = await stat(filePath);
        repo.register(filePath, title, pageCount, fileCount, size);
        id = repo.idOfPath(filePath);
        // A `.nfo` next to the comic documents the new row.
        const nfo = await readNfoFor(filePath);
        if (nfo && id) repo.updateMetadata(id, nfo);
      } catch (error) {
        return { status: 'error', message: openErrorMessage(error) };
      }
      // New row: the library slice reloads (a targeted upsert would need the entry's id).
      notify({ scope: 'library' });
      const organization = id ? await organizer.afterAdd([{ id, path: filePath }]) : NOTHING_ORGANIZED;
      void imageScanner.kick();
      return { status: 'added', title, organization };
    } finally {
      organizer.lock.end();
    }
  });

  handle(LIBRARY_CHANNELS.addFolder, args(), async (event): Promise<ScanResult> => {
    const options: Electron.OpenDialogOptions = {
      title: t('dialogs:addFolder'),
      properties: ['openDirectory'],
      // Where the previous folder was added, when it is still there.
      defaultPath: await existingDirectory(settingsRepo.getAll().lastScanFolder),
    };
    const { canceled, filePaths } = await openDialogFor(event, options);
    if (canceled || filePaths.length === 0) {
      return { status: 'cancelled' };
    }

    return addFolderToLibrary(
      { repo, folders, settings: settingsRepo, decoder, notify, imageScanner, organizer, activeUser },
      filePaths[0],
      scanProgressTo(event),
    );
  });

  handle(LIBRARY_CHANNELS.pickOrganizationFolder, args(), async (event): Promise<PickOrganizationFolderResult> => {
    const options: Electron.OpenDialogOptions = {
      title: t('dialogs:chooseOrganizationFolder'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: await existingDirectory(settingsRepo.getAll().libraryOrganizationFolder),
    };
    const { canceled, filePaths } = await openDialogFor(event, options);
    if (canceled || filePaths.length === 0) {
      return { status: 'cancelled' };
    }
    const folder = filePaths[0];
    settingsRepo.set('libraryOrganizationFolder', folder);
    // Watched like the folders added from the library: a comic dropped there is found by a resynchronization.
    folders.add(folder);
    repo.adoptRoots();
    notify({ scope: 'settings', values: { libraryOrganizationFolder: folder } });
    return { status: 'ok', folder };
  });

  handle(
    LIBRARY_CHANNELS.organize,
    args((value) => expectNonEmptyString(value, 'token', 100)),
    (_event, token) => organizer.organize(token),
  );

  handle(LIBRARY_CHANNELS.countUnorganized, args(), () => organizer.countUnorganized());

  // Progress goes over the scan channel, which the settings page already follows for a resynchronization.
  handle(LIBRARY_CHANNELS.organizeAll, args(), (event) =>
    organizer.organizeAll(scanProgressTo(event)),
  );

  // Both steps report over the scan channel, which the library page already follows.
  handle(
    LIBRARY_CHANNELS.analyzeCleanup,
    args((ids) => expectIdArray(ids, 'ids')),
    (event, ids) =>
      cleaner.analyze(ids, scanProgressTo(event)),
  );

  handle(
    LIBRARY_CHANNELS.applyCleanup,
    args(
      (token) => expectNonEmptyString(token, 'token', 100),
      (kept) => expectStringArray(kept, 'keptExtensions'),
    ),
    (event, token, kept) =>
      cleaner.apply(token, kept, scanProgressTo(event)),
  );

  // Any window may stop it, like the resynchronization: there is one cleanup at a time.
  handle(LIBRARY_CHANNELS.cancelCleanup, args(), () => cleaner.cancel());

  // Stops whatever run over the library files is going (any window may, as for the resynchronization): the one holding
  // the shared lock, and the analysis of the books' cleanup, which only reads and so doesn't take the lock.
  handle(LIBRARY_CHANNELS.cancelRun, args(), () => {
    const lockedRun = organizer.lock.cancel();
    const analysis = cleaner.cancel();
    return lockedRun || analysis;
  });

  handle(LIBRARY_CHANNELS.countConvertible, args(), () => converter.count());

  // Progress goes over the scan channel, like the organization of the whole library.
  handle(LIBRARY_CHANNELS.convertCbr, args(), (event) =>
    converter.convert(scanProgressTo(event)),
  );

  handle(LIBRARY_CHANNELS.countDeflate64, args(), (event) => deflate64.count(scanProgressTo(event)));

  handle(LIBRARY_CHANNELS.convertDeflate64, args(), (event) => deflate64.convert(scanProgressTo(event)));

  handle(LIBRARY_CHANNELS.emptyDeleted, args(), (event) => converter.emptyDeleted(scanProgressTo(event)));

  handle(LIBRARY_CHANNELS.countOrphanFolders, args(), () => folderCleaner.count());

  handle(LIBRARY_CHANNELS.cleanFolders, args(), (event) =>
    folderCleaner.clean(scanProgressTo(event)),
  );

  handle(LIBRARY_CHANNELS.listFolders, args(), () => folders.list());

  handle(
    LIBRARY_CHANNELS.removeFolder,
    args((value) => expectNonEmptyString(value, 'folder', MAX_PATH_LENGTH)),
    (_event, folder) => folders.remove(folder),
  );

  handle(LIBRARY_CHANNELS.listUnlinkedFolders, args(), () => folders.unlinked());

  // The renderer names the folder to find by its id and the main process asks where it is on this machine.
  handle(
    LIBRARY_CHANNELS.relinkFolder,
    args((value) => expectNonEmptyString(value, 'id', 100)),
    async (event, id): Promise<RelinkFolderResult> => {
      const known = folders.unlinked().find((folder) => folder.id === id);
      if (!known) {
        return { status: 'error', message: t('errors:library.unknownFolder') };
      }
      const options: Electron.OpenDialogOptions = {
        title: t('dialogs:relinkFolder', { folder: known.path }),
        properties: ['openDirectory'],
        defaultPath: await existingDirectory(known.path),
      };
      const { canceled, filePaths } = await openDialogFor(event, options);
      if (canceled || filePaths.length === 0) {
        return { status: 'cancelled' };
      }
      folders.relink(id, filePaths[0]);
      repo.adoptRoots();
      notify({ scope: 'library' });
      // Relinked onto a folder the library already knows, two entries may have become one.
      notify({ scope: 'readingLists' });
      // The comics found again may not have been measured yet.
      void imageScanner.kick();
      return { status: 'ok' };
    },
  );

  handle(LIBRARY_CHANNELS.resync, args(), (event) =>
    resynchronizer.run(scanProgressTo(event)),
  );

  // Whichever window started the run (or the start-up): any window may stop it.
  handle(LIBRARY_CHANNELS.cancelResync, args(), () => resynchronizer.cancel());
  handle(LIBRARY_CHANNELS.resyncStatus, args(), () => resynchronizer.progress());
  handle(LIBRARY_CHANNELS.takeStartupOrganization, args(), () => startupOrganization.take());

  // Through the remover, under the shared lock like a removal of several books.
  handle(LIBRARY_CHANNELS.remove, args(idArg, booleanArg), (_event, id, deleteFile) => remover.removeOne(id, deleteFile));

  // Progress goes over the scan channel, which both the library page and the settings page follow.
  handle(
    LIBRARY_CHANNELS.removeMany,
    args((ids) => expectIdArray(ids, 'ids'), booleanArg),
    (event, ids, deleteFiles) => remover.removeMany(ids, deleteFiles, scanProgressTo(event)),
  );

  handle(LIBRARY_CHANNELS.updateProgress, args(idArg, pageIndexArg), (_event, id, currentPage) => {
    repo.updateProgress(id, currentPage);
    notifyUpserted(id);
  });

  handle(
    LIBRARY_CHANNELS.updateRating,
    args(idArg, (rating) => expectInteger(rating, 'rating', 0, 5)),
    (_event, id, rating) => {
      repo.updateRating(id, rating);
      notifyUpserted(id);
    },
  );

  handle(
    LIBRARY_CHANNELS.updateTags,
    args(idArg, (tags) => expectStringArray(tags, 'tags')),
    (_event, id, tags) => {
      repo.updateTags(id, tags);
      notifyUpserted(id);
    },
  );

  // Generated on the spot when missing: books added before thumbnails existed, or by an import
  // whose rebuild hasn't reached them yet.
  // A cloud placeholder is never opened for it (that would download the file): its cached cover or none.
  handle(LIBRARY_CHANNELS.thumbnail, args(idArg), async (_event, id) => {
    const entry = repo.get(id);
    if (!entry) return null;
    const cachedOnly = await isOnlineOnly(entry.path);
    return decoder.thumbnail(entry.path, undefined, cachedOnly).catch(() => null);
  });

  // The renderer sends the picture already cropped to the cover's proportions (from an uploaded file or a page of the book).
  handle(
    LIBRARY_CHANNELS.setCover,
    args(idArg, (value) => expectBytes(value, 'image', MAX_COVER_BYTES)),
    async (_event, id, image): Promise<SetCoverResult> => {
      const entry = repo.get(id);
      if (!entry) return { status: 'error', message: t('errors:library.coverUnknownBook') };
      try {
        await decoder.setThumbnail(entry.path, image);
        return { status: 'ok' };
      } catch (error) {
        return {
          status: 'error',
          message: t('errors:library.coverFailed', { message: errorText(error) }),
        };
      }
    },
  );

  handle(LIBRARY_CHANNELS.imageScanStatus, args(), () => imageScanner.status());

  handle(LIBRARY_CHANNELS.updateMetadata, args(idArg, expectMetadataUpdate), (_event, id, update) => {
    const updated = repo.updateMetadata(id, update);
    if (updated) notify({ scope: 'library', upserted: [updated] });
    return updated;
  });

  handle(
    LIBRARY_CHANNELS.updateMetadataMany,
    args((ids) => expectIdArray(ids, 'ids'), expectMetadataUpdate),
    (_event, ids, update) => {
      const updated = repo.updateMetadataMany(ids, update);
      if (updated.length > 0) notify({ scope: 'library', upserted: updated });
      return updated.length;
    },
  );
}
