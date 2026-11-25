import { writeFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';

import type { ClearCacheResult, ClearLibraryResult, ExportResult, ImportResult } from '../../shared/data';
import { t } from '../../shared/i18n';
import { clearLibraryData } from '../db/clear-library';
import { buildExport, exportFileName } from '../db/export-service';
import { applyImport, parseExport, readExportFile } from '../db/import-service';
import type { DecoderClient } from '../decoder/decoder-client';
import type { LibraryRepository } from '../db/library-repository';
import type { ImageStatsScanner } from '../services/image-stats-scanner';
import type { LibraryRunLock } from '../services/library-organization';
import type { ReadingListRepository } from '../db/reading-list-repository';
import type { SettingsRepository } from '../db/settings-repository';
import { applyMainLanguage } from '../language';
import type { NotifyDataChange } from './data-changes';
import { openDialogFor, saveDialogFor } from './dialogs';
import { handle } from './handle';
import { args } from './validate';

// Channel names are shared with preload.ts: keep them in sync.
export const DATA_CHANNELS = {
  export: 'data:export',
  import: 'data:import',
  clearLibrary: 'data:clear-library',
  clearCache: 'data:clear-cache',
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What {@link registerDataIpc} works with, built once in `main.ts`. */
export interface DataIpcDependencies {
  /** The database, for the import's single transaction and the clearing. */
  db: DatabaseSync;
  /** The library, as the active user sees it. */
  libraryRepo: LibraryRepository;
  /** The settings, exported and replaced by an import. */
  settingsRepo: SettingsRepository;
  /** The active user's reading lists. */
  readingListRepo: ReadingListRepository;
  /** The decoder process: the thumbnails to rebuild or delete. */
  decoder: DecoderClient;
  /** Announces a write to every window. */
  notify: NotifyDataChange;
  /** The background measure of the pages, started after an import. */
  imageScanner: ImageStatsScanner;
  /**
   * The lock shared by the runs over the library files (`organizer.lock`): the import and the clearing take
   * it (kind `data`), so a resynchronization can't add back the books just cleared, nor a walk register
   * files while an import rewrites the library.
   */
  lock: LibraryRunLock;
}

/**
 * Registers the `data:*` handlers: export, import, clearing the library and clearing the thumbnail cache.
 * The import and the clearing refuse to start, with an `error` result, while another run holds `lock`.
 */
export function registerDataIpc({
  db,
  libraryRepo,
  settingsRepo,
  readingListRepo,
  decoder,
  notify,
  imageScanner,
  lock,
}: DataIpcDependencies): void {
  handle(DATA_CHANNELS.export, args(), async (event): Promise<ExportResult> => {
    const options: Electron.SaveDialogOptions = {
      title: t('dialogs:exportData'),
      defaultPath: exportFileName(new Date()),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const { canceled, filePath } = await saveDialogFor(event, options);
    if (canceled || !filePath) {
      return { status: 'cancelled' };
    }

    try {
      const data = buildExport(libraryRepo, settingsRepo, readingListRepo);
      await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { status: 'exported', filePath };
    } catch (error) {
      return { status: 'error', message: t('errors:data.exportFailed', { message: errorMessage(error) }) };
    }
  });

  handle(DATA_CHANNELS.import, args(), async (event): Promise<ImportResult> => {
    const options: Electron.OpenDialogOptions = {
      title: t('dialogs:importData'),
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const { canceled, filePaths } = await openDialogFor(event, options);
    if (canceled || filePaths.length === 0) {
      return { status: 'cancelled' };
    }

    // Taken once the dialog is answered, so an open picker doesn't hold up the other runs.
    if (!lock.tryStart('data')) return { status: 'error', message: lock.busyMessage() };
    try {
      const data = parseExport(await readExportFile(filePaths[0]));
      const counts = applyImport(db, libraryRepo, settingsRepo, readingListRepo, data);
      // The settings were replaced, the language with them.
      applyMainLanguage(settingsRepo.getAll().language);
      decoder.setSidecarCovers(settingsRepo.getAll().librarySidecarCovers);
      notify({ scope: 'library' });
      notify({ scope: 'readingLists' });
      notify({ scope: 'settings' });
      // Thumbnails aren't part of an export: rebuild the cache in the background, without making
      // the import wait for every archive to be opened.
      void decoder.rebuildThumbnails(libraryRepo.list().map((entry) => entry.path)).catch(() => undefined);
      // Same for the pages' sizes of the books the snapshot doesn't carry them for.
      void imageScanner.kick();
      return { status: 'imported', filePath: filePaths[0], ...counts };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    } finally {
      lock.end();
    }
  });

  handle(DATA_CHANNELS.clearLibrary, args(), async (): Promise<ClearLibraryResult> => {
    // A resynchronization running meanwhile would register again the files whose rows were just deleted.
    if (!lock.tryStart('data')) return { status: 'error', message: lock.busyMessage() };
    try {
      const { entries, readingLists } = clearLibraryData(db, libraryRepo, readingListRepo);
      notify({ scope: 'library' });
      notify({ scope: 'readingLists' });
      // Every thumbnail now belongs to a book that is no longer in the library.
      await decoder.pruneThumbnails([]);
      return { status: 'cleared', entries, readingLists };
    } catch (error) {
      return { status: 'error', message: t('errors:data.clearFailed', { message: errorMessage(error) }) };
    } finally {
      lock.end();
    }
  });

  handle(DATA_CHANNELS.clearCache, args(), async (): Promise<ClearCacheResult> => {
    try {
      // The local cache holds only thumbnails; the covers beside the comics are not ours to delete.
      // The library page makes the missing ones again when it shows them.
      await decoder.pruneThumbnails([]);
      return { status: 'cleared' };
    } catch (error) {
      return { status: 'error', message: t('errors:data.clearCacheFailed', { message: errorMessage(error) }) };
    }
  });
}
