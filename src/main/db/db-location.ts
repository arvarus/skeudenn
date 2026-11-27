/**
 * Where the SQLite file lives. This can't be an `AppSettings` entry like everything else: the
 * settings are stored *in* the database, so the location has to be resolvable before the database
 * is open. It lives in its own tiny JSON pointer file, which always stays in `userData` — only
 * the database it points at moves.
 * @module
 */
import { accessSync, constants, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { DatabaseLocation } from '../../shared/data';
import { t } from '../../shared/i18n';

/** Name of the database file unless the user chose another. */
export const DEFAULT_DB_FILE_NAME = 'skeudenn.db';
/** Longest file name accepted, extension included. */
export const MAX_DB_FILE_NAME_LENGTH = 100;
const POINTER_FILE_NAME = 'db-location.json';

function pointerPath(userDataDir: string): string {
  return path.join(userDataDir, POINTER_FILE_NAME);
}

interface LocationPointer {
  directory: string | null;
  fileName: string | null;
}

/**
 * Reads the pointer file. A missing, unreadable or malformed pointer, or a field that isn't usable, falls
 * back to the default for that field rather than throwing: the app must still start when someone hand-edits
 * (or a sync tool mangles) this file.
 */
function readPointer(userDataDir: string): LocationPointer {
  const empty: LocationPointer = { directory: null, fileName: null };
  let raw: string;
  try {
    raw = readFileSync(pointerPath(userDataDir), 'utf-8');
  } catch {
    return empty;
  }
  try {
    const parsed = JSON.parse(raw) as { directory?: unknown; fileName?: unknown } | null;
    const directory = parsed?.directory;
    const fileName = parsed?.fileName;
    return {
      directory: typeof directory === 'string' && directory !== '' ? directory : null,
      fileName: typeof fileName === 'string' && databaseFileNameError(fileName) === null ? fileName : null,
    };
  } catch {
    return empty;
  }
}

function writePointer(userDataDir: string, pointer: LocationPointer): void {
  if (pointer.directory === null && pointer.fileName === null) {
    rmSync(pointerPath(userDataDir), { force: true });
    return;
  }
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(
    pointerPath(userDataDir),
    JSON.stringify(
      {
        ...(pointer.directory !== null && { directory: pointer.directory }),
        ...(pointer.fileName !== null && { fileName: pointer.fileName }),
      },
      null,
      2,
    ),
    'utf-8',
  );
}

/** Points the app at `directory`, or back at `userData` when given null. The chosen file name is kept. */
export function writeLocationPointer(userDataDir: string, directory: string | null): void {
  writePointer(userDataDir, { ...readPointer(userDataDir), directory });
}

/** Names the database file `fileName` (as returned by {@link normalizeDatabaseFileName}), or `skeudenn.db` when given null. The directory is kept. */
export function writeFileNamePointer(userDataDir: string, fileName: string | null): void {
  writePointer(userDataDir, { ...readPointer(userDataDir), fileName });
}

/** The database location the pointer file designates: its directory (else `userData` itself) and its file name (else `skeudenn.db`). */
export function resolveDatabaseLocation(userDataDir: string): DatabaseLocation {
  const pointer = readPointer(userDataDir);
  const directory = pointer.directory ?? userDataDir;
  const fileName = pointer.fileName ?? DEFAULT_DB_FILE_NAME;
  return {
    directory,
    fileName,
    filePath: path.join(directory, fileName),
    isDefault: pointer.directory === null,
    isDefaultFileName: pointer.fileName === null,
  };
}

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Why `fileName` can't name the database file (a message in the interface language), or null when it can. */
export function databaseFileNameError(fileName: string): string | null {
  // Characters no common file system accepts in a name, control characters included.
  // eslint-disable-next-line no-control-regex
  const forbidden = /[\u0000-\u001f\\/:*?"<>|]/;
  const stem = fileName.slice(0, -'.db'.length);
  if (
    !fileName.toLowerCase().endsWith('.db') ||
    stem.trim() === '' ||
    fileName.length > MAX_DB_FILE_NAME_LENGTH ||
    forbidden.test(fileName) ||
    stem.startsWith('.') ||
    /[. ]$/.test(stem) ||
    fileName !== fileName.trim() ||
    RESERVED_WINDOWS_NAMES.test(fileName)
  ) {
    return t('errors:database.invalidFileName', { max: MAX_DB_FILE_NAME_LENGTH });
  }
  return null;
}

/**
 * Turns what the user typed into the file name to store: spaces around it are dropped and `.db` is added
 * when missing. Returns the name, or the error message (interface language) when it can't be a file name.
 */
export function normalizeDatabaseFileName(input: string): { fileName: string } | { error: string } {
  const trimmed = input.trim();
  const fileName = trimmed.toLowerCase().endsWith('.db') ? trimmed : `${trimmed}.db`;
  const error = databaseFileNameError(fileName);
  return error === null ? { fileName } : { error };
}

/**
 * Fails early (with a user-facing message in the interface language) on a directory the app couldn't open a database
 * in — otherwise the problem would only surface as a crash on the next start.
 */
export function checkDirectoryUsable(directory: string): string | null {
  try {
    mkdirSync(directory, { recursive: true });
    accessSync(directory, constants.W_OK);
    return null;
  } catch {
    return t('errors:database.notWritable', { directory });
  }
}
