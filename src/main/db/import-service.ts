/**
 * JSON import: validates a user-picked export file and merges it into the local database.
 * @module
 */
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { isSupportedComicFile } from '../../shared/comic';
import { t } from '../../shared/i18n';
import { CREDIT_ROLES, type CreditInput, type CreditRole, type LibraryEntry } from '../../shared/library';
import { DEFAULT_SETTINGS, MAIN_PROCESS_SETTINGS, isValidSetting, type AppSettings } from '../../shared/settings';
import type { ExportedData, ExportedReadingList } from './export-service';
import type { LibraryRepository } from './library-repository';
import type { ReadingListRepository } from './reading-list-repository';
import type { SettingsRepository } from './settings-repository';
import { withTransaction } from './transaction';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Credits with a last name and a known role; the person ids are not kept (people are matched by name). */
function toCredits(value: unknown): CreditInput[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((credit): CreditInput[] =>
    isRecord(credit) &&
    typeof credit.lastName === 'string' &&
    credit.lastName.trim() !== '' &&
    CREDIT_ROLES.includes(credit.role as CreditRole)
      ? [
          {
            firstName: typeof credit.firstName === 'string' ? credit.firstName : '',
            lastName: credit.lastName,
            role: credit.role as CreditRole,
          },
        ]
      : [],
  );
}

/** The measured average page size, or nulls (to be measured again) unless both are positive numbers. */
function toPageSize(width: unknown, height: unknown): Pick<LibraryEntry, 'avgPageWidth' | 'avgPageHeight'> {
  const w = Math.trunc(toNumber(width, 0));
  const h = Math.trunc(toNumber(height, 0));
  return w > 0 && h > 0 ? { avgPageWidth: w, avgPageHeight: h } : { avgPageWidth: null, avgPageHeight: null };
}

/** Largest export file read, in bytes (a 20 000-book library is about 20 MB). */
export const MAX_IMPORT_BYTES = 256 * 1024 * 1024;

/** The text of an export file picked by the user, refused above `maxBytes` before it is read into memory. */
export async function readExportFile(filePath: string, maxBytes = MAX_IMPORT_BYTES): Promise<string> {
  if ((await stat(filePath)).size > maxBytes) {
    throw new Error(t('errors:import.tooLarge'));
  }
  return readFile(filePath, 'utf-8');
}

/**
 * Whether `filePath` can be a comic's place: absolute (on either family of systems, since an export
 * travels between machines) and with an extension the app opens. An export is a file anyone can edit:
 * its paths later get opened, measured and, by the library organization, moved. A network path
 * (`\\host\share`, `//host/share`, `\\?\…`) is refused: on Windows the first `stat` of it would send the
 * user's credentials to that host.
 */
function isComicPath(filePath: string): boolean {
  if (/^[\\/]{2}/.test(filePath)) return false;
  return (path.posix.isAbsolute(filePath) || path.win32.isAbsolute(filePath)) && isSupportedComicFile(filePath);
}

function toEntry(value: unknown): LibraryEntry | null {
  if (!isRecord(value) || typeof value.path !== 'string' || !isComicPath(value.path)) {
    return null;
  }
  const pageCount = Math.max(0, Math.trunc(toNumber(value.pageCount, 0)));
  const now = new Date().toISOString();
  return {
    id: typeof value.id === 'string' && value.id !== '' ? value.id : randomUUID(),
    path: value.path,
    title: typeof value.title === 'string' ? value.title : value.path,
    pageCount,
    // Clamped like `touch` does: a snapshot can disagree with the file it describes.
    currentPage: Math.min(Math.max(0, Math.trunc(toNumber(value.currentPage, 0))), Math.max(0, pageCount - 1)),
    addedAt: typeof value.addedAt === 'string' ? value.addedAt : now,
    lastOpenedAt: typeof value.lastOpenedAt === 'string' ? value.lastOpenedAt : now,
    fileCount: Math.max(0, Math.trunc(toNumber(value.fileCount, 0))),
    fileSize: Math.max(0, Math.trunc(toNumber(value.fileSize, 0))),
    rating: Math.min(5, Math.max(0, Math.trunc(toNumber(value.rating, 0)))),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    // Exports from before the metadata lookup lack these fields: they come back empty.
    titleLocked: value.titleLocked === true,
    series: toNullableString(value.series),
    volume: toNullableString(value.volume),
    releaseDate: toNullableString(value.releaseDate),
    language: toNullableString(value.language),
    // Both or neither: a half-measured pair would be shown as a size of 0.
    ...toPageSize(value.avgPageWidth, value.avgPageHeight),
    credits: toCredits(value.credits).map((credit) => ({ ...credit, personId: '' })),
  };
}

/** Lists with an id and a name; books are kept as the paths they reference, resolved on import. */
function toReadingLists(value: unknown): ExportedReadingList[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((list): ExportedReadingList[] =>
    isRecord(list) && typeof list.id === 'string' && list.id !== '' && typeof list.name === 'string' && list.name.trim() !== ''
      ? [
          {
            id: list.id,
            name: list.name.trim(),
            createdAt: typeof list.createdAt === 'string' ? list.createdAt : new Date().toISOString(),
            paths: Array.isArray(list.paths) ? list.paths.filter((p): p is string => typeof p === 'string') : [],
          },
        ]
      : [],
  );
}

/**
 * Keeps only the settings keys the app knows about, and only when the stored value passes the
 * key's validator (`SETTING_VALIDATORS`): an old or hand-edited export can't inject unknown keys,
 * wrong types or out-of-range values. What is refused falls back to the default (so an
 * unsupported `language` goes back to `system`).
 */
function toSettings(value: unknown): AppSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (!isRecord(value)) {
    return settings;
  }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const imported = value[key];
    if (isValidSetting(key, imported)) {
      (settings[key] as unknown) = imported;
    }
  }
  return settings;
}

/**
 * Validates the JSON text of a file the user picked. Throws a user-facing message (in the interface language) when
 * it isn't a Skeudenn export; individual library entries that are too broken to use are dropped
 * rather than failing the whole import.
 */
export function parseExport(raw: string): ExportedData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(t('errors:import.notJson'));
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.library)) {
    throw new Error(t('errors:import.notExport'));
  }
  return {
    version: 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    library: parsed.library.map(toEntry).filter((entry): entry is LibraryEntry => entry !== null),
    // Exports from before reading lists have none.
    readingLists: toReadingLists(parsed.readingLists),
    settings: toSettings(parsed.settings),
  };
}

/**
 * Merges a parsed snapshot into the local database: library entries are matched by file path
 * (the snapshot wins for the ones it contains, so restoring a backup restores its progress,
 * ratings and tags), entries only present locally are left alone, and settings are replaced (except the ones only the
 * main process writes, `MAIN_PROCESS_SETTINGS`, which keep their local value).
 * Reading lists are matched by id, the snapshot winning too (their order included: the snapshot's
 * lists come first, in its order); their books are found by path, and a path that matches no
 * library entry is dropped.
 *
 * All or nothing: the whole merge runs in one transaction, so an error midway leaves the database
 * as it was, and 2 000 books take a fraction of the time of one commit per statement.
 * `db` must be the database the three repositories were built on.
 */
export function applyImport(
  db: DatabaseSync,
  libraryRepo: LibraryRepository,
  settingsRepo: SettingsRepository,
  readingListRepo: ReadingListRepository,
  data: ExportedData,
): { added: number; updated: number } {
  return withTransaction(db, () => mergeSnapshot(libraryRepo, settingsRepo, readingListRepo, data));
}

function mergeSnapshot(
  libraryRepo: LibraryRepository,
  settingsRepo: SettingsRepository,
  readingListRepo: ReadingListRepository,
  data: ExportedData,
): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  for (const entry of data.library) {
    if (libraryRepo.upsert(entry) === 'created') {
      added += 1;
    } else {
      updated += 1;
    }
  }
  const idByPath = new Map(libraryRepo.list().map((entry) => [entry.path, entry.id]));
  // Another user may already own a list with the snapshot's id (the same backup imported by two users): this one gets a new id.
  const listIds = data.readingLists.map((list) => (readingListRepo.isForeign(list.id) ? randomUUID() : list.id));
  for (const [index, list] of data.readingLists.entries()) {
    readingListRepo.upsert({
      id: listIds[index],
      name: list.name,
      createdAt: list.createdAt,
      entryIds: list.paths.flatMap((p) => idByPath.get(p) ?? []),
    });
  }
  // The snapshot's lists in its order, then the ones only present locally, in theirs.
  const imported = new Set(listIds);
  readingListRepo.reorderLists([
    ...imported,
    ...readingListRepo.list().flatMap((list) => (imported.has(list.id) ? [] : [list.id])),
  ]);
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    // What only the main process writes keeps its local value: an export is a file anyone can edit, and the
    // organized folder is where the app moves files (and a place that exists on one machine only).
    if (MAIN_PROCESS_SETTINGS.includes(key)) continue;
    settingsRepo.set(key, data.settings[key]);
  }
  return { added, updated };
}
