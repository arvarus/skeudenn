/**
 * Data-management types (database location, JSON export and import) shared between the main process and the
 * renderer (via preload).
 * @module
 */

/** Where the SQLite database file currently lives. */
export interface DatabaseLocation {
  /** Directory holding the database file. */
  directory: string;
  /** Name of the database file inside {@link directory} (`skeudenn.db` unless the user chose another). */
  fileName: string;
  /** Full path of the database file itself, for display. */
  filePath: string;
  /** Whether that's Electron's `userData` directory, i.e. the app's default location. */
  isDefault: boolean;
  /** Whether the file has the default name, `skeudenn.db`. */
  isDefaultFileName: boolean;
}

/** Outcome of picking a new directory for the database. Same rationale as `ImportResult`. */
export type DatabaseLocationResult =
  | { status: 'cancelled' }
  | { status: 'changed'; location: DatabaseLocation }
  | { status: 'error'; message: string };

/** A copy of the database kept in the `.skeudenn` directory beside it. */
export interface BackupInfo {
  /** File name inside the backup directory (`skeudenn-AAAAMMJJ-HHMMSS.db`): the identifier the restoration takes. */
  name: string;
  /** When the copy was made (ISO 8601). */
  createdAt: string;
  /** Size of the copy in bytes. */
  size: number;
}

/** What the backup section of Paramètres › Données shows: the copies and where they are. */
export interface BackupList {
  /** Directory holding the copies. */
  directory: string;
  /** The copies, most recent first. */
  backups: BackupInfo[];
  /** The copy that will replace the database at the next start, or null. */
  pendingRestore: string | null;
}

/** Outcome of making a copy of the database. Same rationale as `ImportResult`. */
export type BackupResult =
  | { status: 'created'; backup: BackupInfo }
  | { status: 'error'; message: string };

/** Outcome of scheduling the restoration of a copy: it is applied at the next start. */
export type RestoreBackupResult =
  | { status: 'scheduled' }
  | { status: 'error'; message: string };

/**
 * Outcome of importing a previously exported JSON snapshot. Validation failures are part of the
 * result rather than a thrown error: an `ipcMain.handle` rejection reaches the renderer wrapped
 * in "Error invoking remote method …", which is not something to show the user.
 */
export type ImportResult =
  | { status: 'cancelled' }
  | { status: 'imported'; filePath: string; added: number; updated: number }
  | { status: 'error'; message: string };

/** Outcome of writing a JSON export. Same rationale as `ImportResult`. */
export type ExportResult =
  | { status: 'cancelled' }
  | { status: 'exported'; filePath: string }
  | { status: 'error'; message: string };

/**
 * Outcome of `data:clear-library`: what it deleted (library entries and reading lists), or why it
 * failed. Same rationale as `ImportResult`.
 */
export type ClearLibraryResult =
  | {
      status: 'cleared';
      /** Number of library entries removed. */
      entries: number;
      /** Number of reading lists deleted. */
      readingLists: number;
    }
  | { status: 'error'; message: string };

/** Outcome of `data:clear-cache`: done, or why it failed. Same rationale as `ImportResult`. */
export type ClearCacheResult = { status: 'cleared' } | { status: 'error'; message: string };
