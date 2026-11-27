import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import {
  checkDirectoryUsable,
  databaseFileNameError,
  normalizeDatabaseFileName,
  resolveDatabaseLocation,
  writeFileNamePointer,
  writeLocationPointer,
} from './db-location';

// The user-facing messages are checked in French; English is the interface's default.
beforeAll(() => applyLanguage('fr'));

describe('db-location', () => {
  let userData: string;

  beforeEach(() => {
    userData = mkdtempSync(path.join(tmpdir(), 'skeudenn-test-'));
  });

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it('defaults to the user data directory when no pointer file exists', () => {
    expect(resolveDatabaseLocation(userData)).toEqual({
      directory: userData,
      fileName: 'skeudenn.db',
      filePath: path.join(userData, 'skeudenn.db'),
      isDefault: true,
      isDefaultFileName: true,
    });
  });

  it('round-trips a configured directory', () => {
    writeLocationPointer(userData, path.join(userData, 'elsewhere'));

    expect(resolveDatabaseLocation(userData)).toEqual({
      directory: path.join(userData, 'elsewhere'),
      fileName: 'skeudenn.db',
      filePath: path.join(userData, 'elsewhere', 'skeudenn.db'),
      isDefault: false,
      isDefaultFileName: true,
    });
  });

  it('goes back to the default when the pointer is removed', () => {
    writeLocationPointer(userData, path.join(userData, 'elsewhere'));
    writeLocationPointer(userData, null);

    expect(resolveDatabaseLocation(userData).isDefault).toBe(true);
  });

  it('round-trips a chosen file name and keeps it when the directory changes', () => {
    writeFileNamePointer(userData, 'bibliotheque.db');
    expect(resolveDatabaseLocation(userData)).toMatchObject({
      directory: userData,
      fileName: 'bibliotheque.db',
      filePath: path.join(userData, 'bibliotheque.db'),
      isDefault: true,
      isDefaultFileName: false,
    });

    writeLocationPointer(userData, path.join(userData, 'elsewhere'));
    expect(resolveDatabaseLocation(userData).filePath).toBe(path.join(userData, 'elsewhere', 'bibliotheque.db'));

    writeLocationPointer(userData, null);
    expect(resolveDatabaseLocation(userData).fileName).toBe('bibliotheque.db');
  });

  it('keeps the directory when the file name goes back to the default, and removes the pointer when nothing is left', () => {
    writeLocationPointer(userData, path.join(userData, 'elsewhere'));
    writeFileNamePointer(userData, 'a.db');
    writeFileNamePointer(userData, null);
    expect(resolveDatabaseLocation(userData).filePath).toBe(path.join(userData, 'elsewhere', 'skeudenn.db'));

    writeLocationPointer(userData, null);
    expect(existsSync(path.join(userData, 'db-location.json'))).toBe(false);
  });

  it('ignores an unusable file name in the pointer file', () => {
    writeFileSync(path.join(userData, 'db-location.json'), '{"fileName":"../evil"}', 'utf-8');
    expect(resolveDatabaseLocation(userData).fileName).toBe('skeudenn.db');
    writeFileSync(path.join(userData, 'db-location.json'), '{"fileName":"ok.db","directory":42}', 'utf-8');
    expect(resolveDatabaseLocation(userData)).toMatchObject({ fileName: 'ok.db', isDefault: true });
  });

  // The app has to start even if this file gets hand-edited or mangled by a sync tool.
  it('falls back to the default on a malformed pointer file', () => {
    writeFileSync(path.join(userData, 'db-location.json'), 'not json', 'utf-8');
    expect(resolveDatabaseLocation(userData)).toMatchObject({ directory: userData, isDefault: true });

    writeFileSync(path.join(userData, 'db-location.json'), '{"directory":""}', 'utf-8');
    expect(resolveDatabaseLocation(userData)).toMatchObject({ directory: userData, isDefault: true });
  });

  it('accepts a writable directory, creating it if needed', () => {
    const directory = path.join(userData, 'new', 'nested');
    expect(checkDirectoryUsable(directory)).toBeNull();
    expect(resolveDatabaseLocation(userData).isDefault).toBe(true);
  });

  it('reports a directory it cannot write into', () => {
    // A file where a directory is expected: mkdir fails on every platform.
    const filePath = path.join(userData, 'a-file');
    writeFileSync(filePath, '', 'utf-8');

    expect(checkDirectoryUsable(filePath)).toMatch(/Impossible d'écrire/);
  });

  describe('database file names', () => {
    it('adds .db when missing and trims the name', () => {
      expect(normalizeDatabaseFileName('  ma base ')).toEqual({ fileName: 'ma base.db' });
      expect(normalizeDatabaseFileName('Comics.DB')).toEqual({ fileName: 'Comics.DB' });
    });

    it.each(['', '   ', '.db', '..db', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b', 'x.', 'con', 'NUL.txt', 'lpt1', 'a\u0000b'])(
      'refuses %j',
      (name) => {
        expect('error' in normalizeDatabaseFileName(name)).toBe(true);
      },
    );

    it('refuses a name that is too long', () => {
      expect(databaseFileNameError(`${'a'.repeat(98)}.db`)).not.toBeNull();
      expect(databaseFileNameError(`${'a'.repeat(97)}.db`)).toBeNull();
    });
  });
});
