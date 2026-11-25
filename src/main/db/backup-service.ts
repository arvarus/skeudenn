/**
 * Copies of the database, kept in a `.tankobon` directory next to it (see ADR 0024). Free of Electron:
 * every function takes the paths it works on, so the tests run on temporary directories.
 * @module
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { BackupInfo } from '../../shared/data';
import { t } from '../../shared/i18n';
import { errorText } from '../../shared/errors';
import { configureConnection } from './schema';

/** Directory holding the copies, beside the database file. */
export const BACKUP_DIR_NAME = '.tankobon';
const BACKUP_PREFIX = 'tankobon-';
const BACKUP_EXTENSION = '.db';
const PENDING_RESTORE_FILE = 'pending-restore.json';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The directory holding the copies of the database living in `databaseDirectory`. */
export function backupDirectory(databaseDirectory: string): string {
  return path.join(databaseDirectory, BACKUP_DIR_NAME);
}

/** Whether `name` looks like a file written by {@link createBackup} (no path, only the generated pattern). */
export function isBackupName(name: string): boolean {
  return /^tankobon-\d{8}-\d{6}(-\d+)?\.db$/.test(name);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function backupName(now: Date, suffix: number): string {
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${BACKUP_PREFIX}${stamp}${suffix > 0 ? `-${suffix}` : ''}${BACKUP_EXTENSION}`;
}

/** The copies in `databaseDirectory`, most recent first. */
export function listBackups(databaseDirectory: string): BackupInfo[] {
  const directory = backupDirectory(databaseDirectory);
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  const backups: BackupInfo[] = [];
  for (const name of names) {
    if (!isBackupName(name)) continue;
    try {
      const stats = statSync(path.join(directory, name));
      if (stats.isFile()) backups.push({ name, createdAt: stats.mtime.toISOString(), size: stats.size });
    } catch {
      // Gone since the listing: not a backup any more.
    }
  }
  // Names carry the local date and time, so they sort like the dates (the file's own mtime can be reset by a sync tool).
  return backups.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** Writes a consistent copy of the open database (`VACUUM INTO`, safe while it is being used) and returns its description. */
export function createBackup(db: DatabaseSync, databaseDirectory: string, now = new Date()): BackupInfo {
  const directory = backupDirectory(databaseDirectory);
  mkdirSync(directory, { recursive: true });
  let suffix = 0;
  while (existsSync(path.join(directory, backupName(now, suffix)))) suffix += 1;
  const name = backupName(now, suffix);
  const target = path.join(directory, name);
  const temporary = `${target}.tmp`;
  rmSync(temporary, { force: true });
  try {
    db.exec(`VACUUM INTO '${temporary.replaceAll("'", "''")}'`);
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  return { name, createdAt: now.toISOString(), size: statSync(target).size };
}

/**
 * Copies the database stored in `databaseFile` through a read-only connection of its own (the app's connection
 * stays untouched, and a writer holding the lock makes this one wait up to the busy timeout), for the backup
 * worker thread. Same copy and same file name as {@link createBackup}.
 */
export function backupDatabaseFile(databaseFile: string, databaseDirectory: string, now = new Date()): BackupInfo {
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    configureConnection(db);
    return createBackup(db, databaseDirectory, now);
  } finally {
    db.close();
  }
}

/** Deletes the oldest copies so that at most `keep` remain; returns how many were deleted. */
export function pruneBackups(databaseDirectory: string, keep: number): number {
  const surplus = listBackups(databaseDirectory).slice(Math.max(1, keep));
  for (const backup of surplus) rmSync(path.join(backupDirectory(databaseDirectory), backup.name), { force: true });
  return surplus.length;
}

/**
 * Whether a scheduled copy is due: the interval is on (1 to 31 days) and the last copy (ISO date, empty when
 * none) is at least that old. An unreadable date counts as none, a date in the future as just made.
 */
export function isBackupDue(lastBackupAt: string, intervalDays: number, now = new Date()): boolean {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) return false;
  const last = Date.parse(lastBackupAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= intervalDays * DAY_MS;
}

/**
 * Asks for `name` to replace the database at the next start. The open file is not touched: overwriting a
 * database in use isn't safe, so {@link applyPendingRestore} does it before the connection is opened.
 * Returns an error message (interface language), or null when the restoration is scheduled.
 */
export function scheduleRestore(userDataDir: string, databaseDirectory: string, name: string): string | null {
  if (!isBackupName(name) || !existsSync(path.join(backupDirectory(databaseDirectory), name))) {
    return t('errors:backup.notFound');
  }
  try {
    mkdirSync(userDataDir, { recursive: true });
    writeFileSync(path.join(userDataDir, PENDING_RESTORE_FILE), JSON.stringify({ name }), 'utf-8');
    return null;
  } catch (error) {
    return t('errors:backup.failed', { message: errorText(error) });
  }
}

/** Cancels a restoration scheduled and not applied yet. */
export function cancelRestore(userDataDir: string): void {
  rmSync(path.join(userDataDir, PENDING_RESTORE_FILE), { force: true });
}

/** The copy waiting to be restored at the next start, or null. */
export function pendingRestore(userDataDir: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(userDataDir, PENDING_RESTORE_FILE), 'utf-8'));
    const name = (parsed as { name?: unknown })?.name;
    return typeof name === 'string' && isBackupName(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * Overwrites the database file with the copy a restoration was scheduled for. To run at start-up, before the
 * database is opened. The pending request is always removed, so a copy that can't be restored doesn't block
 * every following start; the file it would have replaced is kept as `<file>.before-restore` until the next one.
 * Returns whether the database was replaced.
 */
export function applyPendingRestore(userDataDir: string, databaseDirectory: string, databaseFile: string): boolean {
  const name = pendingRestore(userDataDir);
  cancelRestore(userDataDir);
  if (name === null) return false;
  const source = path.join(backupDirectory(databaseDirectory), name);
  if (!existsSync(source)) return false;
  try {
    if (existsSync(databaseFile)) copyFileSync(databaseFile, `${databaseFile}.before-restore`);
    copyFileSync(source, databaseFile);
    // A journal left by the previous file doesn't belong to the restored one.
    rmSync(`${databaseFile}-journal`, { force: true });
    return true;
  } catch {
    return false;
  }
}
