import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyPendingRestore,
  backupDatabaseFile,
  backupDirectory,
  createBackup,
  isBackupDue,
  isBackupName,
  listBackups,
  pendingRestore,
  pruneBackups,
  scheduleRestore,
} from './backup-service';

describe('backup-service', () => {
  let root: string;
  let dbFile: string;
  let db: DatabaseSync;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'skeudenn-backup-'));
    dbFile = path.join(root, 'skeudenn.db');
    db = new DatabaseSync(dbFile);
    db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('one')");
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('writes a readable copy in .skeudenn beside the database', () => {
    const backup = createBackup(db, root, new Date(2026, 0, 2, 3, 4, 5));
    expect(backup.name).toBe('skeudenn-20260102-030405.db');
    expect(backupDirectory(root)).toBe(path.join(root, '.skeudenn'));
    const copy = new DatabaseSync(path.join(root, '.skeudenn', backup.name));
    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'one' });
    copy.close();
  });

  it('copies a database file through a connection of its own, while the app\'s stays open and writable', () => {
    const backup = backupDatabaseFile(dbFile, root, new Date(2026, 0, 2, 3, 4, 5));
    expect(backup.name).toBe('skeudenn-20260102-030405.db');
    const copy = new DatabaseSync(path.join(root, '.skeudenn', backup.name));
    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'one' });
    copy.close();
    // The source was only read: the app's connection still writes, and the copy doesn't follow.
    db.exec("INSERT INTO t VALUES ('two')");
    expect(db.prepare('SELECT COUNT(*) AS n FROM t').get()).toEqual({ n: 2 });
  });

  it('fails without leaving a temporary file when the database file is missing', () => {
    expect(() => backupDatabaseFile(path.join(root, 'missing.db'), root)).toThrow();
    expect(existsSync(path.join(root, '.skeudenn'))).toBe(false);
  });

  it('never overwrites a copy made in the same second', () => {
    const now = new Date(2026, 0, 2, 3, 4, 5);
    const first = createBackup(db, root, now);
    const second = createBackup(db, root, now);
    expect(second.name).not.toBe(first.name);
    expect(listBackups(root)).toHaveLength(2);
  });

  it('lists the copies most recent first and ignores other files', () => {
    createBackup(db, root, new Date(2026, 0, 1, 10, 0, 0));
    createBackup(db, root, new Date(2026, 0, 3, 10, 0, 0));
    writeFileSync(path.join(root, '.skeudenn', 'notes.txt'), 'x');
    expect(listBackups(root).map((b) => b.name)).toEqual(['skeudenn-20260103-100000.db', 'skeudenn-20260101-100000.db']);
  });

  it('keeps only the most recent copies', () => {
    for (let day = 1; day <= 4; day++) createBackup(db, root, new Date(2026, 0, day, 10, 0, 0));
    expect(pruneBackups(root, 2)).toBe(2);
    expect(listBackups(root).map((b) => b.name)).toEqual(['skeudenn-20260104-100000.db', 'skeudenn-20260103-100000.db']);
    expect(pruneBackups(root, 0)).toBe(1);
  });

  it('decides when a copy is due', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    expect(isBackupDue('', 7, now)).toBe(true);
    expect(isBackupDue('garbage', 7, now)).toBe(true);
    expect(isBackupDue('2026-03-04T12:00:00Z', 7, now)).toBe(false);
    expect(isBackupDue('2026-03-03T12:00:00Z', 7, now)).toBe(true);
    expect(isBackupDue('', 0, now)).toBe(false);
  });

  it('only accepts generated names', () => {
    expect(isBackupName('skeudenn-20260102-030405.db')).toBe(true);
    expect(isBackupName('../skeudenn-20260102-030405.db')).toBe(false);
    expect(isBackupName('skeudenn.db')).toBe(false);
  });

  it('restores a copy over the database file at start-up', () => {
    const userData = path.join(root, 'userData');
    mkdirSync(userData);
    const backup = createBackup(db, root);
    db.exec("UPDATE t SET v = 'two'");
    db.close();
    expect(scheduleRestore(userData, root, backup.name)).toBeNull();
    expect(pendingRestore(userData)).toBe(backup.name);
    expect(applyPendingRestore(userData, root, dbFile)).toBe(true);
    expect(pendingRestore(userData)).toBeNull();
    db = new DatabaseSync(dbFile);
    expect(db.prepare('SELECT v FROM t').get()).toEqual({ v: 'one' });
    expect(existsSync(`${dbFile}.before-restore`)).toBe(true);
    expect(readFileSync(`${dbFile}.before-restore`).length).toBeGreaterThan(0);
  });

  it('refuses to schedule an unknown or path-like name', () => {
    expect(scheduleRestore(root, root, 'skeudenn-20260102-030405.db')).not.toBeNull();
    expect(scheduleRestore(root, root, '../../etc/passwd')).not.toBeNull();
    expect(pendingRestore(root)).toBeNull();
  });
});
