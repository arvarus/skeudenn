/**
 * JSON export of the local database (library, reading lists, settings).
 * @module
 */
import type { LibraryEntry } from '../../shared/library';
import type { AppSettings } from '../../shared/settings';
import type { LibraryRepository } from './library-repository';
import type { ReadingListRepository } from './reading-list-repository';
import type { SettingsRepository } from './settings-repository';

/**
 * A reading list as exported. Its books are referenced by file path, like the library entries
 * are matched on import: library ids aren't stable across machines.
 */
export interface ExportedReadingList {
  id: string;
  name: string;
  createdAt: string;
  /** Paths of the list's books, in reading order. */
  paths: string[];
}

/** Format of a JSON export file — also what `parseExport` accepts back. */
export interface ExportedData {
  version: 1;
  exportedAt: string;
  library: LibraryEntry[];
  /** Absent from exports made before reading lists existed. */
  readingLists: ExportedReadingList[];
  settings: AppSettings;
}

/** Snapshots the whole local database for the user to export as a JSON file. */
export function buildExport(
  libraryRepo: LibraryRepository,
  settingsRepo: SettingsRepository,
  readingListRepo: ReadingListRepository,
): ExportedData {
  const library = libraryRepo.list();
  const pathById = new Map(library.map((entry) => [entry.id, entry.path]));
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    library,
    readingLists: readingListRepo.list().map((list) => ({
      id: list.id,
      name: list.name,
      createdAt: list.createdAt,
      paths: list.entryIds.flatMap((id) => pathById.get(id) ?? []),
    })),
    settings: settingsRepo.getAll(),
  };
}

/**
 * Default file name offered by the export's save dialog: `skeudenn-export-YYYY-MM-DD-HHhMM.json`,
 * in local time so that it matches the user's clock, with the time so that several exports of the
 * same day don't overwrite one another. No `:`, which Windows refuses in file names.
 */
export function exportFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `skeudenn-export-${day}-${pad(date.getHours())}h${pad(date.getMinutes())}.json`;
}
